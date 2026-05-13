import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { MigrateCliError, runMigrateCli } from "../../src/cli/migrate.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { openDb } from "../../src/store/db.ts";
import { findUnknownLabels } from "../../src/store/labels.ts";
import { insertReview } from "../../src/store/records.ts";
import { DEFAULT_FIELDS, fixturePath } from "../util/tmp.ts";

async function seedProject(name: string): Promise<{
  dir: string;
  dbPath: string;
  bakDir: string;
  [Symbol.dispose]: () => void;
}> {
  const dir = mkdtempSync(join(tmpdir(), `labellens-migrate-${name}-`));
  const stateDir = join(dir, ".labellens");
  mkdirSync(stateDir);
  const dbPath = join(stateDir, "state.db");
  const inputPath = fixturePath("tiny.jsonl");
  const config = {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: inputPath, format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: join(dir, "reviewed.jsonl"), format: "jsonl" },
  };
  writeFileSync(join(dir, "labellens.config.json"), JSON.stringify(config));

  const db = openDb(dbPath);
  await ingestFile(db, inputPath, DEFAULT_FIELDS);
  db.$client.close();

  return {
    dir,
    dbPath,
    bakDir: `${stateDir}.bak`,
    [Symbol.dispose]() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function countLabel(
  dbPath: string,
  column: "label" | "final_label" | "prev_label",
  value: string,
): number {
  const db = openDb(dbPath);
  try {
    const table = column === "label" ? "predictions" : "reviews";
    const row = db.all<{ n: number }>(
      sql.raw(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = '${value}'`),
    )[0];
    return row?.n ?? 0;
  } finally {
    db.$client.close();
  }
}

describe("runMigrateCli", () => {
  test("rewrites predictions.label and creates .labellens.bak/", async () => {
    using project = await seedProject("tracer");
    expect(countLabel(project.dbPath, "label", "food")).toBeGreaterThan(0);

    await runMigrateCli({ args: ["--rename", "food:meal"], cwd: project.dir });

    expect(countLabel(project.dbPath, "label", "food")).toBe(0);
    expect(countLabel(project.dbPath, "label", "meal")).toBeGreaterThan(0);
    expect(existsSync(project.bakDir)).toBe(true);
    expect(existsSync(join(project.bakDir, "state.db"))).toBe(true);
  });

  test("collision suffixes backup dir with .bak-<ts>", async () => {
    using project = await seedProject("collision");
    mkdirSync(project.bakDir);
    writeFileSync(join(project.bakDir, "marker"), "preexisting");

    await runMigrateCli({ args: ["--rename", "food:meal"], cwd: project.dir });

    const marker = join(project.bakDir, "marker");
    expect(existsSync(marker)).toBe(true);
    const entries = readdirSync(project.dir);
    const suffixed = entries.find((e) => e.startsWith(".labellens.bak-") && /\d+$/.test(e));
    expect(suffixed).toBeTruthy();
  });

  test("second run is no-op: no backup, exits cleanly", async () => {
    using project = await seedProject("idempotent");
    await runMigrateCli({ args: ["--rename", "food:meal"], cwd: project.dir });
    rmSync(project.bakDir, { recursive: true, force: true });

    await runMigrateCli({ args: ["--rename", "food:meal"], cwd: project.dir });

    expect(existsSync(project.bakDir)).toBe(false);
    expect(countLabel(project.dbPath, "label", "food")).toBe(0);
    expect(countLabel(project.dbPath, "label", "meal")).toBeGreaterThan(0);
  });

  test("guard roundtrip: unknown labels disappear after migrate", async () => {
    using project = await seedProject("guard-roundtrip");
    // config has labels ['food','travel','other']. tiny.jsonl introduces
    // 'shopping','utility','salary','rent','ENTRY_START' which are unknown.
    const configured = ["food", "travel", "other"];

    const before = openDb(project.dbPath);
    const unknownBefore = findUnknownLabels(before, configured).map((u) => u.label);
    before.$client.close();
    expect(unknownBefore).toContain("shopping");

    await runMigrateCli({ args: ["--rename", "shopping:other"], cwd: project.dir });

    const after = openDb(project.dbPath);
    try {
      const unknownAfter = findUnknownLabels(after, configured).map((u) => u.label);
      expect(unknownAfter).not.toContain("shopping");
    } finally {
      after.$client.close();
    }
  });

  test("1000 records: migrate completes < 1s", async () => {
    const dir = mkdtempSync(join(tmpdir(), "labellens-migrate-perf-"));
    try {
      const stateDir = join(dir, ".labellens");
      mkdirSync(stateDir);
      const dbPath = join(stateDir, "state.db");
      const inputPath = join(dir, "big.jsonl");
      const lines: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const label = i % 2 === 0 ? "food" : "travel";
        lines.push(
          JSON.stringify({ text: `row ${i}`, prediction: label, confidence: 0.5, source: "synth" }),
        );
      }
      writeFileSync(inputPath, `${lines.join("\n")}\n`);
      writeFileSync(
        join(dir, "labellens.config.json"),
        JSON.stringify({
          task: "classification",
          labels: ["food", "travel"],
          input: { path: inputPath, format: "jsonl", fields: DEFAULT_FIELDS },
          output: { path: join(dir, "out.jsonl"), format: "jsonl" },
        }),
      );
      const db = openDb(dbPath);
      const { ingestFile } = await import("../../src/ingest/ingest.ts");
      await ingestFile(db, inputPath, DEFAULT_FIELDS);
      db.$client.close();

      const t0 = performance.now();
      await runMigrateCli({ args: ["--rename", "food:meal"], cwd: dir });
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(1000);
      expect(countLabel(dbPath, "label", "food")).toBe(0);
      expect(countLabel(dbPath, "label", "meal")).toBe(500);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("missing --rename throws MigrateCliError", async () => {
    using project = await seedProject("missing-flag");
    await expect(runMigrateCli({ args: [], cwd: project.dir })).rejects.toBeInstanceOf(
      MigrateCliError,
    );
  });

  test("bad --rename format (no colon) throws", async () => {
    using project = await seedProject("bad-format");
    await expect(runMigrateCli({ args: ["--rename", "foo"], cwd: project.dir })).rejects.toThrow(
      /expected <old>:<new>/,
    );
  });

  test("missing labellens.config.json throws MigrateCliError", async () => {
    const dir = mkdtempSync(join(tmpdir(), "labellens-migrate-noconfig-"));
    try {
      await expect(runMigrateCli({ args: ["--rename", "a:b"], cwd: dir })).rejects.toBeInstanceOf(
        MigrateCliError,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("missing .labellens/state.db throws", async () => {
    const dir = mkdtempSync(join(tmpdir(), "labellens-migrate-nodb-"));
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
      await expect(runMigrateCli({ args: ["--rename", "a:b"], cwd: dir })).rejects.toThrow(
        /no review state found/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("records.raw and predictions.raw JSON payloads are untouched", async () => {
    using project = await seedProject("raw");
    const before = openDb(project.dbPath);
    const recordRaws = before
      .all<{ raw: string }>(sql`SELECT raw FROM records ORDER BY row_index`)
      .map((r) => r.raw);
    const predRaws = before
      .all<{ raw: string }>(sql`SELECT raw FROM predictions ORDER BY id`)
      .map((r) => r.raw);
    before.$client.close();

    await runMigrateCli({ args: ["--rename", "food:meal"], cwd: project.dir });

    const after = openDb(project.dbPath);
    try {
      const recordRawsAfter = after
        .all<{ raw: string }>(sql`SELECT raw FROM records ORDER BY row_index`)
        .map((r) => r.raw);
      const predRawsAfter = after
        .all<{ raw: string }>(sql`SELECT raw FROM predictions ORDER BY id`)
        .map((r) => r.raw);
      expect(recordRawsAfter).toEqual(recordRaws);
      expect(predRawsAfter).toEqual(predRaws);
      expect(predRaws.some((r) => r.includes('"food"'))).toBe(true);
    } finally {
      after.$client.close();
    }
  });

  test("undo history: relabel chain prev_label survives rename", async () => {
    using project = await seedProject("undo-history");
    const db = openDb(project.dbPath);
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
      record_id: ids[0]!,
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    db.$client.close();

    await runMigrateCli({ args: ["--rename", "food:meal"], cwd: project.dir });

    const verify = openDb(project.dbPath);
    try {
      const rows = verify.all<{
        status: string;
        final_label: string | null;
        prev_label: string | null;
      }>(
        sql`SELECT status, final_label, prev_label FROM reviews WHERE record_id = ${ids[0]} ORDER BY id`,
      );
      expect(rows[0]).toEqual({ status: "accepted", final_label: "meal", prev_label: null });
      expect(rows[1]).toEqual({ status: "relabeled", final_label: "travel", prev_label: "meal" });
    } finally {
      verify.$client.close();
    }
  });

  test("merge case: renaming into an existing label collapses both partitions", async () => {
    using project = await seedProject("merge");
    const beforeFood = countLabel(project.dbPath, "label", "food");
    const beforeTravel = countLabel(project.dbPath, "label", "travel");
    expect(beforeFood).toBeGreaterThan(0);
    expect(beforeTravel).toBeGreaterThan(0);

    await runMigrateCli({ args: ["--rename", "food:travel"], cwd: project.dir });

    expect(countLabel(project.dbPath, "label", "food")).toBe(0);
    expect(countLabel(project.dbPath, "label", "travel")).toBe(beforeFood + beforeTravel);
  });

  test("rewrites reviews.final_label and reviews.prev_label", async () => {
    using project = await seedProject("reviews");
    const db = openDb(project.dbPath);
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
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    db.$client.close();

    await runMigrateCli({ args: ["--rename", "food:meal"], cwd: project.dir });

    expect(countLabel(project.dbPath, "final_label", "food")).toBe(0);
    expect(countLabel(project.dbPath, "final_label", "meal")).toBe(1);
    expect(countLabel(project.dbPath, "prev_label", "food")).toBe(0);
    expect(countLabel(project.dbPath, "prev_label", "meal")).toBe(1);
  });
});
