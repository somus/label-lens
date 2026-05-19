import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { buildRegistry } from "../../src/actions/command.ts";
import { dispatch } from "../../src/actions/dispatch.ts";
import { exportCommand, paletteExportCommand } from "../../src/actions/export/run.ts";
import { defaultRegistry } from "../../src/actions/registry.ts";
import { createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import type { Db } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

function makeConfig(outputPath: string, format: "jsonl" | "csv" = "jsonl"): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: outputPath, format },
  };
}

function mkTmpDir(): { dir: string; [Symbol.dispose]: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "labellens-export-"));
  return {
    dir,
    [Symbol.dispose]() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("export command registration", () => {
  test("export.run is registered with binding 'e' in global scope", () => {
    const reg = defaultRegistry();
    const cmd = reg.get("export.run");
    expect(cmd?.name).toBe(exportCommand.name);
    expect(cmd?.scope).toBe("global");
    expect(cmd?.binding).toBe("e");
  });

  test("palette.export is registered with palette ':export'", () => {
    const reg = defaultRegistry();
    const cmd = reg.get("palette.export");
    expect(cmd?.name).toBe(paletteExportCommand.name);
    expect(cmd?.palette).toBe(":export");
  });
});

describe(":export <format>", () => {
  test("writes the JSONL file at the configured output.path and flashes the path", async () => {
    using tmp = mkTmpDir();
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const outPath = join(tmp.dir, "reviewed.jsonl");
    const app = createAppContext({
      db: store.db,
      config: makeConfig(outPath),
      display: { ...defaultDisplay(), motion: true },
      requestRender: () => {},
      onQuit: () => {},
    });
    const reg = buildRegistry([paletteExportCommand]);
    const result = await dispatch(reg, "review", app, "palette.export", "jsonl");
    expect(result.kind).toBe("ok");
    expect(existsSync(outPath)).toBe(true);
    const contents = readFileSync(outPath, "utf8");
    expect(contents).toContain("food");
    expect(app.flash?.message).toContain(outPath);
    expect(app.motion.snapshot("export.complete")).toMatchObject({
      active: true,
      kind: "flash",
      tone: "info",
    });
  });

  test("supports csv, review-log, and stats formats writing to derived sibling paths", async () => {
    using tmp = mkTmpDir();
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const outPath = join(tmp.dir, "reviewed.jsonl");
    const app = createAppContext({
      db: store.db,
      config: makeConfig(outPath),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    const reg = buildRegistry([paletteExportCommand]);
    await dispatch(reg, "review", app, "palette.export", "csv");
    await dispatch(reg, "review", app, "palette.export", "review-log");
    await dispatch(reg, "review", app, "palette.export", "stats");
    expect(existsSync(join(tmp.dir, "reviewed.csv"))).toBe(true);
    expect(existsSync(join(tmp.dir, "reviewed.review-log.jsonl"))).toBe(true);
    expect(existsSync(join(tmp.dir, "reviewed.stats.md"))).toBe(true);
  });

  test("parses --include-rejected and --include-orphans flags from the argument", async () => {
    using tmp = mkTmpDir();
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "rejected",
      final_label: null,
      prev_label: "food",
      source_of_truth: "human",
    });
    const outPath = join(tmp.dir, "reviewed.jsonl");
    const app = createAppContext({
      db: store.db,
      config: makeConfig(outPath),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    const reg = buildRegistry([paletteExportCommand]);
    await dispatch(reg, "review", app, "palette.export", "jsonl --include-rejected");
    const contents = readFileSync(outPath, "utf8").trim().split("\n");
    expect(contents).toHaveLength(1);
    const row = JSON.parse(contents[0]!);
    expect(row.label).toBeNull();
  });

  test("flashes an error when the format argument is unrecognised", async () => {
    using tmp = mkTmpDir();
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const outPath = join(tmp.dir, "reviewed.jsonl");
    const app = createAppContext({
      db: store.db,
      config: makeConfig(outPath),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    const reg = buildRegistry([paletteExportCommand]);
    await dispatch(reg, "review", app, "palette.export", "yaml");
    expect(app.flash?.kind).toBe("error");
  });
});

describe("`e` binding", () => {
  test("uses config.output.format when no argument supplied", async () => {
    using tmp = mkTmpDir();
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const outPath = join(tmp.dir, "reviewed.jsonl");
    const app = createAppContext({
      db: store.db,
      config: makeConfig(outPath, "csv"),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    const reg = buildRegistry([exportCommand]);
    await dispatch(reg, "review", app, "export.run");
    expect(existsSync(join(tmp.dir, "reviewed.csv"))).toBe(true);
    expect(existsSync(outPath)).toBe(false); // didn't write jsonl
  });

  test("orphans queue scope implies --include-orphans (no double-filter)", async () => {
    using tmp = mkTmpDir();
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    store.db.run(sql`UPDATE records SET orphan = 1 WHERE id = ${ids[0]}`);
    const outPath = join(tmp.dir, "reviewed.jsonl");
    const app = createAppContext({
      db: store.db,
      config: makeConfig(outPath),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    enterReview(app, "orphans");
    const reg = buildRegistry([exportCommand]);
    await dispatch(reg, "review", app, "export.run");
    const rows = readFileSync(outPath, "utf8").trim().split("\n");
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!).id).toBe(ids[0]);
  });

  test("--include-orphans surfaces orphan rows even when the active queue's where filters them out", async () => {
    using tmp = mkTmpDir();
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    // Mark record #2 as orphan but give it a flagged-style import issue so a
    // `pending`-scoped export with --include-orphans surfaces it.
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[1]!,
      status: "accepted",
      final_label: "travel",
      prev_label: null,
      source_of_truth: "human",
    });
    store.db.run(sql`UPDATE records SET orphan = 1 WHERE id = ${ids[1]}`);
    const outPath = join(tmp.dir, "reviewed.jsonl");
    const app = createAppContext({
      db: store.db,
      config: makeConfig(outPath),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    // Scope to pending queue (its where: NOT EXISTS effective_reviews AND orphan = 0).
    // Without --include-orphans this won't return orphans. With it, the orphan
    // row must surface regardless of the queue's hardcoded orphan filter.
    enterReview(app, "pending");
    const reg = buildRegistry([paletteExportCommand]);
    await dispatch(reg, "review", app, "palette.export", "jsonl --include-orphans");
    const rowIds = readFileSync(outPath, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l).id as string);
    // Accepted record #0 is in scope; orphan record #1 surfaces via the flag.
    expect(rowIds).toContain(ids[1]!);
  });

  test("honors the active queue's where clause when scoping the export", async () => {
    using tmp = mkTmpDir();
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    // record #0 -> llm:gpt-4 accepted; record #6 (Coffee at Blue Tokai) has primary llm:gpt-4 too;
    // record #8 (Refund from Swiggy) has primary regex.simple. Insert two accepted reviews:
    // one llm:gpt-4 and one regex.simple. With queue by-source:regex.simple only the second should
    // surface.
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[8]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const outPath = join(tmp.dir, "reviewed.jsonl");
    const app = createAppContext({
      db: store.db,
      config: makeConfig(outPath),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    enterReview(app, "by-source:regex.simple");
    const reg = buildRegistry([exportCommand]);
    await dispatch(reg, "review", app, "export.run");
    const lines = readFileSync(outPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]!);
    expect(row.id).toBe(ids[8]!);
  });
});
