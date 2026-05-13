import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { diffIngest } from "../../src/ingest/reingest.ts";
import { DEFAULT_FIELDS, fixturePath, openTmpStore, tmpdir } from "../util/tmp.ts";

describe("diffIngest", () => {
  test("same JSONL → all three buckets empty", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const diff = await diffIngest(store.db, fixturePath("tiny.jsonl"), DEFAULT_FIELDS);
    expect(diff.predictionsOnly).toEqual([]);
    expect(diff.orphans).toEqual([]);
    expect(diff.newRecords).toEqual([]);
  });

  test("text edit on one row → 1 orphan + 1 new, others unchanged", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    using dir = tmpdir({ prefix: "labellens-reingest-" });
    const lines = readFileSync(fixturePath("tiny.jsonl"), "utf-8").split("\n").filter(Boolean);
    const original = JSON.parse(lines[0]!);
    const originalText = original.text;
    original.text = "Lunch at Zomato Pune"; // text changed → new content hash id
    lines[0] = JSON.stringify(original);
    const newPath = join(dir.path, "tiny-edited.jsonl");
    writeFileSync(newPath, `${lines.join("\n")}\n`);

    const diff = await diffIngest(store.db, newPath, DEFAULT_FIELDS);
    expect(diff.orphans).toHaveLength(1);
    expect(diff.newRecords).toHaveLength(1);
    expect(diff.newRecords[0]!.text).toBe("Lunch at Zomato Pune");
    expect(diff.predictionsOnly).toEqual([]);
    // sanity — the original id no longer matches anything in the new file
    expect(originalText).not.toBe(diff.newRecords[0]!.text);
  });

  test("bumped confidence on one row → predictionsOnly bucket of 1", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    using dir = tmpdir({ prefix: "labellens-reingest-" });
    const lines = readFileSync(fixturePath("tiny.jsonl"), "utf-8").split("\n");
    const first = JSON.parse(lines[0]!);
    first.confidence = 0.99; // was 0.92
    lines[0] = JSON.stringify(first);
    const newPath = join(dir.path, "tiny-bumped.jsonl");
    writeFileSync(newPath, lines.join("\n"));

    const diff = await diffIngest(store.db, newPath, DEFAULT_FIELDS);
    expect(diff.predictionsOnly).toHaveLength(1);
    expect(diff.predictionsOnly[0]!.predictions[0]!.confidence).toBe(0.99);
    expect(diff.orphans).toEqual([]);
    expect(diff.newRecords).toEqual([]);
  });
});
