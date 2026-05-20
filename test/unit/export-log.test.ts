import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { exportReviewLogString } from "../../src/export/log.ts";
import type { Db } from "../../src/store/db.ts";
import { insertUndoEntry } from "../../src/store/queries.ts";
import { insertReview, updateRecordNote } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

function lines(out: string): Record<string, unknown>[] {
  return out.length === 0
    ? []
    : out
        .split("\n")
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("exportReviewLogString", () => {
  test("emits every review row including undo, ordered by reviewed_at asc", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);

    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[1]!,
      status: "relabeled",
      final_label: "rideshare",
      prev_label: "travel",
      source_of_truth: "human+assistant",
    });
    insertUndoEntry(store.db, ids[1]!); // compensating row, status:undone

    const rows = lines(exportReviewLogString(store.db));
    expect(rows).toHaveLength(3);

    expect(rows[0]!.status).toBe("accepted");
    expect(rows[0]!.record_id).toBe(ids[0]);
    expect(rows[0]!.final_label).toBe("food");
    expect(rows[0]!.source_of_truth).toBe("human");

    expect(rows[1]!.status).toBe("relabeled");
    expect(rows[1]!.source_of_truth).toBe("human+assistant");

    expect(rows[2]!.status).toBe("undone");
    expect(rows[2]!.record_id).toBe(ids[1]);

    // ordered ascending by reviewed_at
    expect(typeof rows[0]!.reviewed_at).toBe("string");
    expect(String(rows[0]!.reviewed_at) <= String(rows[1]!.reviewed_at)).toBe(true);
    expect(String(rows[1]!.reviewed_at) <= String(rows[2]!.reviewed_at)).toBe(true);
  });

  test("emits note captured at write time", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    updateRecordNote(store.db, ids[0]!, "needs second look");
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const [row] = lines(exportReviewLogString(store.db));
    expect(row!.note).toBe("needs second look");
  });

  test("review note is snapshot — later record-note edits do not mutate it", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    updateRecordNote(store.db, ids[0]!, "first");
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    updateRecordNote(store.db, ids[0]!, "second");
    const [row] = lines(exportReviewLogString(store.db));
    expect(row!.note).toBe("first");
  });

  test("undo entry emits note: null (undo is a meta-action, not a decision)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    updateRecordNote(store.db, ids[0]!, "first");
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    updateRecordNote(store.db, ids[0]!, "second");
    insertUndoEntry(store.db, ids[0]!);
    const rows = lines(exportReviewLogString(store.db));
    expect(rows[0]!.note).toBe("first");
    expect(rows[1]!.status).toBe("undone");
    expect(rows[1]!.note).toBeNull();
  });

  test("emits batch_id field: NULL for non-batch reviews and the shared id for batch members", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
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
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
      batch_id: "00000000-0000-4000-8000-000000000001",
    });
    insertReview(store.db, {
      record_id: ids[2]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
      batch_id: "00000000-0000-4000-8000-000000000001",
    });
    const rows = lines(exportReviewLogString(store.db));
    expect(Object.hasOwn(rows[0]!, "batch_id")).toBe(true);
    expect(rows[0]!.batch_id).toBeNull();
    expect(rows[1]!.batch_id).toBe("00000000-0000-4000-8000-000000000001");
    expect(rows[2]!.batch_id).toBe("00000000-0000-4000-8000-000000000001");
  });

  test("review row with no note emits note: null", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const [row] = lines(exportReviewLogString(store.db));
    expect(Object.hasOwn(row!, "note")).toBe(true);
    expect(row!.note).toBeNull();
  });
});
