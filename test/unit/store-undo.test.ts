import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../../src/store/db.ts";
import { currentReview, insertUndoEntry } from "../../src/store/queries.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

function firstRecordId(db: Db): string {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index LIMIT 1`)[0]!.id;
}

describe("currentReview / undo", () => {
  test("returns null when record has no reviews", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    expect(currentReview(store.db, firstRecordId(store.db))).toBeNull();
  });

  test("returns the only review when one exists", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = firstRecordId(store.db);
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("accepted");
    expect(cur?.final_label).toBe("food");
  });

  test("returns latest of several reviews", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = firstRecordId(store.db);
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: id,
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("relabeled");
    expect(cur?.final_label).toBe("travel");
  });

  test("returns null when latest review is undone via compensating entry", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = firstRecordId(store.db);
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertUndoEntry(store.db, id);
    expect(currentReview(store.db, id)).toBeNull();
  });

  test("returns prior review when latest was undone", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = firstRecordId(store.db);
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: id,
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    insertUndoEntry(store.db, id);
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("accepted");
    expect(cur?.final_label).toBe("food");
  });

  test("insertUndoEntry returns null when nothing to undo", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = firstRecordId(store.db);
    expect(insertUndoEntry(store.db, id)).toBeNull();
  });
});
