import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import type { RecordWithPrimaryPrediction, StoredPrediction, StoredReview } from "../types.ts";
import type { Db, TxOrDb } from "./db.ts";
import { records, recordsWithPrimary, reviews } from "./schema.ts";

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

function reviewRowToStored(row: typeof reviews.$inferSelect): StoredReview {
  return {
    id: row.id,
    record_id: row.recordId,
    status: row.status,
    final_label: row.finalLabel,
    prev_label: row.prevLabel,
    note: row.note,
    reviewed_at: row.reviewedAt,
    source_of_truth: row.sourceOfTruth,
    compensates_review_id: row.compensatesReviewId,
  };
}

/**
 * Latest review row for a record that is neither status='undone' nor referenced
 * by an undone-row's compensates_review_id. Returns null when the record has no
 * effective review (pending, or fully undone).
 */
export function currentReview(db: TxOrDb, recordId: string): StoredReview | null {
  const row = db
    .select()
    .from(reviews)
    .where(
      and(
        eq(reviews.recordId, recordId),
        sql`${reviews.status} != 'undone'`,
        sql`${reviews.id} NOT IN (
          SELECT compensates_review_id FROM reviews
          WHERE compensates_review_id IS NOT NULL
        )`,
      ),
    )
    .orderBy(desc(reviews.id))
    .limit(1)
    .get();
  return row ? reviewRowToStored(row) : null;
}

/**
 * Most recent up-to-`limit` review rows that are neither undone nor compensated,
 * newest first. Drives the history strip.
 */
export function recentReviews(db: TxOrDb, limit: number): StoredReview[] {
  const rows = db
    .select()
    .from(reviews)
    .where(
      and(
        sql`${reviews.status} != 'undone'`,
        sql`${reviews.id} NOT IN (
          SELECT compensates_review_id FROM reviews
          WHERE compensates_review_id IS NOT NULL
        )`,
      ),
    )
    .orderBy(desc(reviews.id))
    .limit(limit)
    .all();
  return rows.map(reviewRowToStored);
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
 * its effective review state (latest non-undone, non-compensated review).
 * Records with no effective review go to `pending`. ADR 0003.
 */
export function progressCounts(db: TxOrDb): ProgressCounts {
  const total = db.select({ n: sql<number>`COUNT(*)` }).from(records).get()?.n ?? 0;

  const rows = db.all<{ status: string; n: number }>(sql`
    SELECT effective.status AS status, COUNT(*) AS n FROM (
      SELECT (
        SELECT r.status FROM reviews r
        WHERE r.record_id = records.id
          AND r.status != 'undone'
          AND r.id NOT IN (
            SELECT compensates_review_id FROM reviews
            WHERE compensates_review_id IS NOT NULL
          )
        ORDER BY r.id DESC LIMIT 1
      ) AS status
      FROM records
    ) effective
    GROUP BY effective.status
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

/** Most recent non-undone, non-compensated review across the whole DB (for global undo). */
export function latestReview(db: TxOrDb): StoredReview | null {
  const row = db
    .select()
    .from(reviews)
    .where(
      and(
        sql`${reviews.status} != 'undone'`,
        sql`${reviews.id} NOT IN (
          SELECT compensates_review_id FROM reviews
          WHERE compensates_review_id IS NOT NULL
        )`,
      ),
    )
    .orderBy(desc(reviews.id))
    .limit(1)
    .get();
  return row ? reviewRowToStored(row) : null;
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
      note: null,
      reviewedAt: new Date().toISOString(),
      sourceOfTruth: "human",
      compensatesReviewId: target.id,
    })
    .returning({ id: reviews.id })
    .get();
  return inserted?.id ?? null;
}
