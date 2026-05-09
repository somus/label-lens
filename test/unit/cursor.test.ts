import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { FieldMap } from "../../src/config/inference.ts";
import { openCursor } from "../../src/cursor/cursor.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { insertReview } from "../../src/store/records.ts";
import { applySchema } from "../../src/store/schema.ts";

const FIELDS: FieldMap = {
  text: "text",
  prediction: "prediction",
  confidence: "confidence",
  source: "source",
  context_before: "context_before",
  context_after: "context_after",
};

async function freshCursor() {
  const db = new Database(":memory:");
  applySchema(db);
  await ingestFile(db, "test/fixtures/tiny.jsonl", FIELDS);
  return { db, cursor: openCursor(db, "pending") };
}

describe("Cursor", () => {
  test("starts at the first pending record", async () => {
    const { cursor } = await freshCursor();
    expect(cursor.total).toBe(10);
    expect(cursor.position).toBe(0);
    expect(cursor.current()?.text).toBe("Lunch at Zomato Bangalore");
  });

  test("next/prev moves within bounds", async () => {
    const { cursor } = await freshCursor();
    cursor.next();
    expect(cursor.position).toBe(1);
    cursor.prev();
    expect(cursor.position).toBe(0);
    cursor.prev();
    expect(cursor.position).toBe(0);
  });

  test("emits change event on movement", async () => {
    const { cursor } = await freshCursor();
    let changed = 0;
    cursor.on("change", () => {
      changed++;
    });
    cursor.next();
    cursor.next();
    cursor.prev();
    expect(changed).toBe(3);
  });

  test("refresh keeps focus on the same record id when possible", async () => {
    const { db, cursor } = await freshCursor();
    cursor.next();
    cursor.next();
    const focused = cursor.current()!;
    cursor.refresh();
    expect(cursor.current()?.id).toBe(focused.id);

    insertReview(db, {
      record_id: focused.id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      note: null,
      source_of_truth: "human",
    });
    cursor.refresh();
    expect(cursor.total).toBe(9);
    expect(cursor.current()?.id).not.toBe(focused.id);
  });

  test("seek finds a record by id", async () => {
    const { cursor } = await freshCursor();
    const target = cursor.current()!;
    cursor.next();
    cursor.next();
    expect(cursor.seek(target.id)).toBe(true);
    expect(cursor.current()?.id).toBe(target.id);
    expect(cursor.seek("not-a-real-id")).toBe(false);
  });

  test("seekIndex clamps to bounds", async () => {
    const { cursor } = await freshCursor();
    cursor.seekIndex(999);
    expect(cursor.position).toBe(9);
    cursor.seekIndex(-5);
    expect(cursor.position).toBe(0);
  });
});
