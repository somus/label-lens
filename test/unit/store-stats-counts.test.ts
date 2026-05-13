import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { aggregateDecisionRows, aggregateProgressRows } from "../../src/store/stats.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

describe("aggregateProgressRows", () => {
  test("emits four ADR-0003 buckets in fixed order", async () => {
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

    expect(aggregateProgressRows(store.db)).toEqual([
      { kind: "progress", bucket: "total", count: 10 },
      { kind: "progress", bucket: "reviewed", count: 3 },
      { kind: "progress", bucket: "pending", count: 6 },
      { kind: "progress", bucket: "skipped", count: 1 },
    ]);
  });
});

describe("aggregateDecisionRows", () => {
  test("emits accepted/relabeled/rejected/skipped counts", async () => {
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
      final_label: "travel",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[2]!,
      status: "relabeled",
      final_label: "food",
      prev_label: "shopping",
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[3]!,
      status: "rejected",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });

    expect(aggregateDecisionRows(store.db)).toEqual([
      { kind: "decision", status: "accepted", count: 2 },
      { kind: "decision", status: "relabeled", count: 1 },
      { kind: "decision", status: "rejected", count: 1 },
      { kind: "decision", status: "skipped", count: 0 },
    ]);
  });
});
