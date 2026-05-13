import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ExportCliError, runExportCli } from "../../src/cli/export.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { openDb } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { DEFAULT_FIELDS, fixturePath } from "../util/tmp.ts";

async function seedProject(name: string): Promise<{
  dir: string;
  outputPath: string;
  [Symbol.dispose]: () => void;
}> {
  const dir = mkdtempSync(join(tmpdir(), `labellens-cli-${name}-`));
  const stateDir = join(dir, ".labellens");
  mkdirSync(stateDir);
  const dbPath = join(stateDir, "state.db");
  const inputPath = fixturePath("tiny.jsonl");
  const outputPath = join(dir, "reviewed.jsonl");

  const config = {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: inputPath, format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: outputPath, format: "jsonl" },
  };
  writeFileSync(join(dir, "labellens.config.json"), JSON.stringify(config));

  const db = openDb(dbPath);
  await ingestFile(db, inputPath, DEFAULT_FIELDS);
  const ids = db
    .all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`)
    .map((r) => r.id);
  insertReview(db, {
    record_id: ids[0]!,
    status: "accepted",
    final_label: "food",
    prev_label: null,
    source_of_truth: "human",
  });
  insertReview(db, {
    record_id: ids[1]!,
    status: "rejected",
    final_label: null,
    prev_label: "travel",
    source_of_truth: "human",
  });
  db.$client.close();

  return {
    dir,
    outputPath,
    [Symbol.dispose]() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("runExportCli", () => {
  test("writes JSONL without mounting a TUI; honors --include-rejected", async () => {
    using project = await seedProject("jsonl");
    await runExportCli({ args: ["jsonl", "--include-rejected"], cwd: project.dir });
    expect(existsSync(project.outputPath)).toBe(true);
    const rows = readFileSync(project.outputPath, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe("food");
    expect(rows[1].label).toBeNull();
  });

  test("'stats' format renders Markdown at the derived sibling path", async () => {
    using project = await seedProject("stats");
    await runExportCli({ args: ["stats"], cwd: project.dir });
    const statsPath = project.outputPath.replace(/\.jsonl$/, ".stats.md");
    expect(existsSync(statsPath)).toBe(true);
    const md = readFileSync(statsPath, "utf8");
    expect(md).toContain("# LabelLens stats —");
    expect(md).toContain("## Progress");
  });

  test("'-o <path>' overrides the output path", async () => {
    using project = await seedProject("override");
    const overridePath = join(project.dir, "custom.jsonl");
    await runExportCli({ args: ["jsonl", "-o", overridePath], cwd: project.dir });
    expect(existsSync(overridePath)).toBe(true);
    expect(existsSync(project.outputPath)).toBe(false);
  });

  test("throws ExportCliError when labellens.config.json is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "labellens-cli-noconfig-"));
    try {
      await expect(runExportCli({ args: ["jsonl"], cwd: dir })).rejects.toBeInstanceOf(
        ExportCliError,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws ExportCliError when .labellens/state.db is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "labellens-cli-nodb-"));
    try {
      writeFileSync(
        join(dir, "labellens.config.json"),
        JSON.stringify({
          task: "classification",
          labels: ["food"],
          input: { path: "./missing.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
          output: { path: "./out.jsonl", format: "jsonl" },
        }),
      );
      await expect(runExportCli({ args: ["jsonl"], cwd: dir })).rejects.toThrow(
        /no review state found/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws ExportCliError when -o is missing its path argument", async () => {
    using project = await seedProject("bad-args");
    await expect(runExportCli({ args: ["jsonl", "-o"], cwd: project.dir })).rejects.toThrow(
      /requires a path/,
    );
  });
});
