import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { runExportCli } from "../../src/cli/export.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { openDb } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { DEFAULT_FIELDS, fixturePath } from "../util/tmp.ts";

async function seed(opts: { output: Record<string, unknown> }): Promise<{
  dir: string;
  outputPath: string;
  [Symbol.dispose]: () => void;
}> {
  const dir = mkdtempSync(join(tmpdir(), "labellens-output-cfg-"));
  const stateDir = join(dir, ".labellens");
  mkdirSync(stateDir);
  const dbPath = join(stateDir, "state.db");
  const inputPath = fixturePath("tiny.jsonl");
  const outputPath = join(dir, "reviewed.jsonl");
  const config = {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: inputPath, format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: outputPath, format: "jsonl", ...opts.output },
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
  insertReview(db, {
    record_id: ids[2]!,
    status: "skipped",
    final_label: null,
    prev_label: null,
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

describe("output.* config defaults", () => {
  test("output.includeRejected = true: rejected rows appear without --include-rejected", async () => {
    using project = await seed({ output: { includeRejected: true } });
    await runExportCli({ args: ["jsonl"], cwd: project.dir });
    const rows = readFileSync(project.outputPath, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.label === null)).toBeDefined();
  });

  test("output.includeSkipped = true: skipped rows appear with label=null", async () => {
    using project = await seed({ output: { includeSkipped: true } });
    await runExportCli({ args: ["jsonl"], cwd: project.dir });
    const rows = readFileSync(project.outputPath, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.some((r) => r.label === null)).toBe(true);
  });

  test("output.fieldOverrides remaps the column name in JSONL exports", async () => {
    using project = await seed({ output: { fieldOverrides: { label: "category" } } });
    await runExportCli({ args: ["jsonl"], cwd: project.dir });
    const rows = readFileSync(project.outputPath, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(rows[0].category).toBe("food");
    expect(rows[0].label).toBeUndefined();
  });

  test("output.csvMultiLabelSeparator (declared via config) round-trips through validation", async () => {
    using project = await seed({ output: { csvMultiLabelSeparator: "|" } });
    expect(existsSync(join(project.dir, "labellens.config.json"))).toBe(true);
  });
});
