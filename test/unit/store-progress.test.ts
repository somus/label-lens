import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../../src/store/db.ts";
import { insertUndoEntry, progressCounts } from "../../src/store/queries.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

describe("progressCounts (ADR 0003 buckets)", () => {
  test("starts with all records pending", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const c = progressCounts(store.db);
    expect(c).toEqual({
      total: 10,
      accepted: 0,
      relabeled: 0,
      rejected: 0,
      skipped: 0,
      pending: 10,
    });
  });

  test("buckets reflect each effective review state", async () => {
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
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[2]!,
      status: "rejected",
      final_label: null,
      prev_label: "food",
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[3]!,
      status: "skipped",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });

    expect(progressCounts(store.db)).toEqual({
      total: 10,
      accepted: 1,
      relabeled: 1,
      rejected: 1,
      skipped: 1,
      pending: 6,
    });
  });

  test("undone records return to pending bucket", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    expect(progressCounts(store.db).accepted).toBe(1);
    insertUndoEntry(store.db, ids[0]!);
    const c = progressCounts(store.db);
    expect(c.accepted).toBe(0);
    expect(c.pending).toBe(10);
  });
});
