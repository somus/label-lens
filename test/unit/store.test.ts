import { describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import type { FieldMap } from "../../src/config/inference.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { openDb } from "../../src/store/db.ts";
import { insertReview, listPendingRecords, progressCounts } from "../../src/store/records.ts";

const FIELDS: FieldMap = {
  text: "text",
  prediction: "prediction",
  confidence: "confidence",
  source: "source",
  context_before: "context_before",
  context_after: "context_after",
};

function freshDb(suffix: string) {
  const path = `/tmp/labellens-store-${suffix}-${Date.now()}.db`;
  if (existsSync(path)) unlinkSync(path);
  return { path, db: openDb(path) };
}

describe("store + ingest", () => {
  test("ingests tiny.jsonl into records + predictions", async () => {
    const { db } = freshDb("ingest");
    const result = await ingestFile(db, "test/fixtures/tiny.jsonl", FIELDS);
    expect(result.ingested).toBe(10);
    expect(result.skipped).toBe(0);

    const counts = progressCounts(db);
    expect(counts.total).toBe(10);
    expect(counts.reviewed).toBe(0);
    expect(counts.pending).toBe(10);

    const pending = listPendingRecords(db);
    expect(pending.length).toBe(10);
    expect(pending[0]?.text).toBe("Lunch at Zomato Bangalore");
    expect(pending[0]?.primaryPrediction?.label).toBe("food");
  });

  test("primary prediction picks highest confidence", async () => {
    const { db } = freshDb("primary");
    await ingestFile(db, "test/fixtures/tiny.jsonl", FIELDS);
    const pending = listPendingRecords(db);
    const coffee = pending.find((r) => r.text.startsWith("Coffee"));
    expect(coffee?.primaryPrediction?.label).toBe("food");
    expect(coffee?.primaryPrediction?.confidence).toBeCloseTo(0.81);
  });

  test("accept moves record out of pending", async () => {
    const { db } = freshDb("accept");
    await ingestFile(db, "test/fixtures/tiny.jsonl", FIELDS);
    const pending = listPendingRecords(db);
    const first = pending[0]!;
    insertReview(db, {
      record_id: first.id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      note: null,
      source_of_truth: "human",
    });
    const after = listPendingRecords(db);
    expect(after.length).toBe(9);
    expect(after.find((r) => r.id === first.id)).toBeUndefined();
    const counts = progressCounts(db);
    expect(counts.reviewed).toBe(1);
    expect(counts.pending).toBe(9);
  });

  test("re-ingest is idempotent (INSERT OR IGNORE)", async () => {
    const { db } = freshDb("idempotent");
    await ingestFile(db, "test/fixtures/tiny.jsonl", FIELDS);
    await ingestFile(db, "test/fixtures/tiny.jsonl", FIELDS);
    const counts = progressCounts(db);
    expect(counts.total).toBe(10);
  });
});
