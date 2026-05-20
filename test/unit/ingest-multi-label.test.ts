import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { INGEST_WARNINGS_CAP, ingestFile } from "../../src/ingest/ingest.ts";
import { predictions } from "../../src/store/schema.ts";
import { DEFAULT_FIELDS, openTmpStore, tmpdir } from "../util/tmp.ts";

const CONFIGURED = ["spam", "toxicity", "promotion"];

function writeJsonl(dir: string, lines: object[]): string {
  const path = join(dir, "input.jsonl");
  writeFileSync(path, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`, "utf8");
  return path;
}

test("multi-label ingest stores Prediction label sets as canonical JSON array text", async () => {
  using store = await openTmpStore();
  using dir = tmpdir();
  const input = writeJsonl(dir.path, [
    {
      id: "r1",
      text: "buy cheap stuff",
      predictions: [{ label: ["toxicity", "spam"], confidence: 0.9, source: "modelA" }],
    },
  ]);
  const result = await ingestFile(store.db, input, DEFAULT_FIELDS, {
    task: "multi-label",
    labels: CONFIGURED,
  });
  expect(result.ingested).toBe(1);
  const row = store.db.select().from(predictions).get();
  expect(row?.label).toBe('["spam","toxicity"]');
});

test("multi-label ingest drops unknown + duplicate labels with warnings", async () => {
  using store = await openTmpStore();
  using dir = tmpdir();
  const input = writeJsonl(dir.path, [
    {
      id: "r1",
      text: "x",
      predictions: [{ label: ["spam", "bogus", "spam", "toxicity"], source: "modelA" }],
    },
  ]);
  const result = await ingestFile(store.db, input, DEFAULT_FIELDS, {
    task: "multi-label",
    labels: CONFIGURED,
  });
  const row = store.db.select().from(predictions).get();
  expect(row?.label).toBe('["spam","toxicity"]');
  expect(result.warnings.join("\n")).toMatch(/bogus/);
  expect(result.warnings.join("\n")).toMatch(/spam/);
});

test("multi-label ingest drops Predictions with non-array labels and warns", async () => {
  using store = await openTmpStore();
  using dir = tmpdir();
  const input = writeJsonl(dir.path, [
    {
      id: "r1",
      text: "x",
      predictions: [
        { label: "spam", source: "stringy" },
        { label: ["toxicity"], source: "arrayed" },
      ],
    },
  ]);
  const result = await ingestFile(store.db, input, DEFAULT_FIELDS, {
    task: "multi-label",
    labels: CONFIGURED,
  });
  expect(result.ingested).toBe(1);
  const rows = store.db.select().from(predictions).all();
  expect(rows.length).toBe(1);
  expect(rows[0]?.source).toBe("arrayed");
  expect(rows[0]?.label).toBe('["toxicity"]');
  expect(result.warnings.join("\n")).toMatch(/stringy/);
});

test("multi-label ingest caps in-memory warnings (warningCount tracks the true total)", async () => {
  // Generates more bad-label rows than the cap so the warnings array does
  // not grow linearly with row count on noisy datasets. The CLI still
  // surfaces the total via warningCount.
  using store = await openTmpStore();
  using dir = tmpdir();
  const overflowRows = INGEST_WARNINGS_CAP + 50;
  const rows = Array.from({ length: overflowRows }, (_, i) => ({
    id: `r${i}`,
    text: `text-${i}`,
    predictions: [{ label: ["bogus-only"], source: "modelA" }],
  }));
  const input = writeJsonl(dir.path, rows);
  const result = await ingestFile(store.db, input, DEFAULT_FIELDS, {
    task: "multi-label",
    labels: CONFIGURED,
  });
  expect(result.warnings.length).toBe(INGEST_WARNINGS_CAP);
  expect(result.warningCount).toBe(overflowRows);
});

test("single-label ingest unchanged when no taskOptions passed", async () => {
  using store = await openTmpStore();
  using dir = tmpdir();
  const input = writeJsonl(dir.path, [
    {
      id: "r1",
      text: "x",
      predictions: [{ label: "spam", source: "modelA" }],
    },
  ]);
  const result = await ingestFile(store.db, input, DEFAULT_FIELDS);
  expect(result.ingested).toBe(1);
  const row = store.db.select().from(predictions).get();
  expect(row?.label).toBe("spam");
  expect(result.warnings).toEqual([]);
});
