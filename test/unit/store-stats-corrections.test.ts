import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { correctionRateByLabel, topCorrections } from "../../src/store/stats.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

/**
 * Seed five effective reviews so:
 *   prev=food   accepted    final=food    (not a correction)
 *   prev=food   relabeled   final=travel  ×2
 *   prev=travel accepted    final=travel  (not a correction)
 *   prev=travel relabeled   final=food    ×1
 *
 * Expected:
 *   topCorrections → [{food→travel, 2}, {travel→food, 1}]
 *   correctionRateByLabel → [{food, 2/3, 3}, {travel, 0.5, 2}]
 */
function seedCorrections(db: Db): void {
  const ids = recordIds(db);
  insertReview(db, {
    record_id: ids[0]!,
    status: "relabeled",
    final_label: "travel",
    prev_label: "food",
    source_of_truth: "human",
  });
  insertReview(db, {
    record_id: ids[1]!,
    status: "relabeled",
    final_label: "travel",
    prev_label: "food",
    source_of_truth: "human",
  });
  insertReview(db, {
    record_id: ids[2]!,
    status: "accepted",
    final_label: "food",
    prev_label: "food",
    source_of_truth: "human",
  });
  insertReview(db, {
    record_id: ids[3]!,
    status: "accepted",
    final_label: "travel",
    prev_label: "travel",
    source_of_truth: "human",
  });
  insertReview(db, {
    record_id: ids[4]!,
    status: "relabeled",
    final_label: "food",
    prev_label: "travel",
    source_of_truth: "human",
  });
}

describe("topCorrections", () => {
  test("groups relabeled rows by (prev, final); ordered by count DESC", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedCorrections(store.db);

    expect(topCorrections(store.db)).toEqual([
      { kind: "top-correction", from: "food", to: "travel", count: 2 },
      { kind: "top-correction", from: "travel", to: "food", count: 1 },
    ]);
  });

  test("limit parameter clamps output", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedCorrections(store.db);
    expect(topCorrections(store.db, 1)).toEqual([
      { kind: "top-correction", from: "food", to: "travel", count: 2 },
    ]);
  });

  test("excludes accepted and rejected rows", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: "food",
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[1]!,
      status: "rejected",
      final_label: null,
      prev_label: "travel",
      source_of_truth: "human",
    });
    expect(topCorrections(store.db)).toEqual([]);
  });
});

describe("correctionRateByLabel", () => {
  test("rate = relabeled / reviewed-with-prev grouped by prev_label", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    seedCorrections(store.db);

    expect(correctionRateByLabel(store.db)).toEqual([
      { kind: "correction-rate-by-label", prevLabel: "food", rate: 2 / 3, reviewed: 3 },
      { kind: "correction-rate-by-label", prevLabel: "travel", rate: 0.5, reviewed: 2 },
    ]);
  });
});
