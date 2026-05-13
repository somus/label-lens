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
    expect(cmd).toBe(exportCommand);
    expect(cmd?.scope).toBe("global");
    expect(cmd?.binding).toBe("e");
  });

  test("palette.export is registered with palette ':export'", () => {
    const reg = defaultRegistry();
    const cmd = reg.get("palette.export");
    expect(cmd).toBe(paletteExportCommand);
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
      display: defaultDisplay(),
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
