import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueProgress, signalCounts, statsTotals } from "../../src/app/sidebar-data.ts";
import type { Db } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { issues } from "../../src/store/schema.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

function seedIssue(db: Db, recordId: string, type: string): void {
  db.insert(issues)
    .values({ recordId, type, score: null, source: "test", createdAt: new Date().toISOString() })
    .run();
}

function clearIssues(db: Db): void {
  db.run(sql`DELETE FROM issues`);
}

describe("signalCounts", () => {
  test("null recordIds returns dataset-wide counts grouped by type, descending", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    clearIssues(store.db);
    const ids = recordIds(store.db);
    seedIssue(store.db, ids[0]!, "low_confidence");
    seedIssue(store.db, ids[1]!, "low_confidence");
    seedIssue(store.db, ids[2]!, "source_disagreement");

    const rows = signalCounts(store.db, null);
    expect(rows).toEqual([
      { type: "low_confidence", count: 2 },
      { type: "source_disagreement", count: 1 },
    ]);
  });

  test("scoped recordIds restricts the count", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    clearIssues(store.db);
    const ids = recordIds(store.db);
    seedIssue(store.db, ids[0]!, "low_confidence");
    seedIssue(store.db, ids[1]!, "low_confidence");
    seedIssue(store.db, ids[2]!, "low_confidence");

    const rows = signalCounts(store.db, [ids[0]!, ids[1]!]);
    expect(rows).toEqual([{ type: "low_confidence", count: 2 }]);
  });

  test("empty recordIds short-circuits to []", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    expect(signalCounts(store.db, [])).toEqual([]);
  });

  test("returns [] when no issues exist", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    clearIssues(store.db);
    expect(signalCounts(store.db, null)).toEqual([]);
  });
});

describe("queueProgress (dataset-wide)", () => {
  test("reviewed counts accepted + relabeled + rejected dataset-wide; total = orphan-free dataset size", async () => {
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
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });

    const result = queueProgress(store.db);
    expect(result.reviewed).toBe(2);
    expect(result.total).toBe(ids.length);
  });

  test("undone reviews are excluded (effective_reviews per ADR 0007)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: "food",
      source_of_truth: "human",
    });
    const originalId = store.db.all<{ id: number }>(
      sql`SELECT id FROM reviews WHERE record_id = ${ids[0]!} ORDER BY id DESC LIMIT 1`,
    )[0]!.id;
    store.db.run(
      sql`INSERT INTO reviews (record_id, status, final_label, prev_label, reviewed_at, source_of_truth, compensates_review_id)
          VALUES (${ids[0]!}, 'undone', NULL, 'food', ${new Date().toISOString()}, 'human', ${originalId})`,
    );

    const result = queueProgress(store.db);
    expect(result.reviewed).toBe(0);
    expect(result.total).toBe(ids.length);
  });

  test("skipped reviews are excluded from the reviewed count", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "skipped",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });
    expect(queueProgress(store.db).reviewed).toBe(0);
  });

  test("empty dataset returns zeros", async () => {
    using store = await openTmpStore();
    expect(queueProgress(store.db)).toEqual({ reviewed: 0, total: 0 });
  });
});

describe("statsTotals", () => {
  test("returns dataset-wide breakdown grouped by status", async () => {
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
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[2]!,
      status: "rejected",
      final_label: null,
      prev_label: "shopping",
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[3]!,
      status: "skipped",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });

    const t = statsTotals(store.db);
    expect(t.total).toBe(10);
    expect(t.accepted).toBe(1);
    expect(t.relabeled).toBe(1);
    expect(t.rejected).toBe(1);
    expect(t.skipped).toBe(1);
    expect(t.reviewed).toBe(3); // accepted + relabeled + rejected; skipped excluded
    expect(t.pending).toBe(10 - 3 - 1);
  });

  test("empty dataset returns zeros across the board", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    store.db.run(sql`DELETE FROM records`);
    expect(statsTotals(store.db)).toEqual({
      total: 0,
      reviewed: 0,
      pending: 0,
      accepted: 0,
      relabeled: 0,
      rejected: 0,
      skipped: 0,
    });
  });

  test("orphaned records are excluded from total", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    store.db.run(sql`UPDATE records SET orphan = 1 WHERE id = ${ids[0]!}`);
    expect(statsTotals(store.db).total).toBe(9);
  });
});
