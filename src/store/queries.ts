import { asc, desc, eq, type SQL, sql } from "drizzle-orm";
import type { RecordWithPrimaryPrediction, StoredPrediction, StoredReview } from "../types.ts";
import type { Db, TxOrDb } from "./db.ts";
import { effectiveReviews, records, recordsWithPrimary, reviews } from "./schema.ts";

type ViewRow = typeof recordsWithPrimary.$inferSelect;

function hydrate(row: ViewRow): RecordWithPrimaryPrediction {
  const primary: StoredPrediction | null =
    row.primaryPredictionId !== null &&
    row.primaryLabel !== null &&
    row.primarySource !== null &&
    row.primaryRaw !== null
      ? {
          id: row.primaryPredictionId,
          record_id: row.id,
          label: row.primaryLabel,
          confidence: row.primaryConfidence,
          source: row.primarySource,
          reason: row.primaryReason,
          raw: row.primaryRaw,
        }
      : null;
  return {
    id: row.id,
    source_path: row.sourcePath,
    row_index: row.rowIndex,
    text: row.text,
    context_before: row.contextBefore,
    context_after: row.contextAfter,
    raw: row.raw,
    note: row.note,
    primaryPrediction: primary,
    latestReview: null,
  };
}

export type QueueQuery = {
  where?: SQL;
  orderBy?: SQL;
  limit?: number;
};

export function queueRecords(db: Db, query: QueueQuery = {}): RecordWithPrimaryPrediction[] {
  const order = query.orderBy ?? asc(recordsWithPrimary.rowIndex);
  let q = db.select().from(recordsWithPrimary).$dynamic();
  if (query.where) q = q.where(query.where);
  q = q.orderBy(order);
  if (query.limit) q = q.limit(query.limit);
  return q.all().map(hydrate);
}

export function recordById(db: Db, id: string): RecordWithPrimaryPrediction | null {
  const row = db.select().from(recordsWithPrimary).where(eq(recordsWithPrimary.id, id)).get();
  return row ? hydrate(row) : null;
}

type EffectiveRow = typeof effectiveReviews.$inferSelect;

function effectiveRowToStored(row: EffectiveRow): StoredReview {
  return {
    id: row.id,
    record_id: row.recordId,
    status: row.status,
    final_label: row.finalLabel,
    prev_label: row.prevLabel,
    reviewed_at: row.reviewedAt,
    source_of_truth: row.sourceOfTruth,
    compensates_review_id: row.compensatesReviewId,
  };
}

function reviewRowToStored(row: typeof reviews.$inferSelect): StoredReview {
  return {
    id: row.id,
    record_id: row.recordId,
    status: row.status,
    final_label: row.finalLabel,
    prev_label: row.prevLabel,
    reviewed_at: row.reviewedAt,
    source_of_truth: row.sourceOfTruth,
    compensates_review_id: row.compensatesReviewId,
  };
}

/** Latest effective review for a record. ADR 0007. */
export function currentReview(db: TxOrDb, recordId: string): StoredReview | null {
  const row = db
    .select()
    .from(effectiveReviews)
    .where(eq(effectiveReviews.recordId, recordId))
    .orderBy(desc(effectiveReviews.id))
    .limit(1)
    .get();
  return row ? effectiveRowToStored(row) : null;
}

/**
 * Most recent up-to-`limit` review rows excluding rows that have been
 * compensated by a later undo, newest first. Includes undo rows so history
 * shows the user's undo as a distinct event. (Intentionally not scoped to
 * `effective_reviews` — see ADR 0007.)
 */
export function recentReviews(db: TxOrDb, limit: number): StoredReview[] {
  const rows = db
    .select()
    .from(reviews)
    .where(
      sql`${reviews.id} NOT IN (
        SELECT compensates_review_id FROM reviews
        WHERE compensates_review_id IS NOT NULL
      )`,
    )
    .orderBy(desc(reviews.id))
    .limit(limit)
    .all();
  return rows.map(reviewRowToStored);
}

export type HistoryEntry = StoredReview & { recordText: string };

export function recentReviewsWithText(db: TxOrDb, limit: number): HistoryEntry[] {
  const rows = db
    .select({
      review: reviews,
      recordText: records.text,
    })
    .from(reviews)
    .innerJoin(records, eq(reviews.recordId, records.id))
    .where(
      sql`${reviews.id} NOT IN (
        SELECT compensates_review_id FROM reviews
        WHERE compensates_review_id IS NOT NULL
      )`,
    )
    .orderBy(desc(reviews.id))
    .limit(limit)
    .all();
  return rows.map((r) => ({ ...reviewRowToStored(r.review), recordText: r.recordText }));
}

export type ProgressCounts = {
  total: number;
  accepted: number;
  relabeled: number;
  rejected: number;
  skipped: number;
  pending: number;
};

/**
 * Per-record bucket counts. Each record falls into exactly one bucket based on
 * its effective review state. Records with no effective review go to `pending`.
 * ADR 0003 (four-bucket invariant) + ADR 0007 (effective view).
 */
export function progressCounts(db: TxOrDb): ProgressCounts {
  const total = db.select({ n: sql<number>`COUNT(*)` }).from(records).get()?.n ?? 0;

  const rows = db.all<{ status: string | null; n: number }>(sql`
    SELECT (
      SELECT er.status FROM effective_reviews er
      WHERE er.record_id = records.id
      ORDER BY er.id DESC LIMIT 1
    ) AS status, COUNT(*) AS n
    FROM records
    GROUP BY status
  `);

  const counts: ProgressCounts = {
    total,
    accepted: 0,
    relabeled: 0,
    rejected: 0,
    skipped: 0,
    pending: 0,
  };
  for (const row of rows) {
    if (row.status === null) counts.pending += row.n;
    else if (row.status === "accepted") counts.accepted += row.n;
    else if (row.status === "relabeled") counts.relabeled += row.n;
    else if (row.status === "rejected") counts.rejected += row.n;
    else if (row.status === "skipped") counts.skipped += row.n;
  }
  return counts;
}

/** Most recent effective review across the whole DB. Drives global undo. ADR 0007. */
export function latestReview(db: TxOrDb): StoredReview | null {
  const row = db.select().from(effectiveReviews).orderBy(desc(effectiveReviews.id)).limit(1).get();
  return row ? effectiveRowToStored(row) : null;
}

/**
 * Insert a compensating review row that undoes the current effective review.
 * Returns the new row's id, or null if there is nothing to undo.
 */
export function insertUndoEntry(db: TxOrDb, recordId: string): number | null {
  const target = currentReview(db, recordId);
  if (!target) return null;
  const inserted = db
    .insert(reviews)
    .values({
      recordId,
      status: "undone",
      finalLabel: null,
      prevLabel: target.final_label,
      reviewedAt: new Date().toISOString(),
      sourceOfTruth: "human",
      compensatesReviewId: target.id,
    })
    .returning({ id: reviews.id })
    .get();
  return inserted?.id ?? null;
}
