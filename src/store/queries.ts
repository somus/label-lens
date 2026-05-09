import { asc, eq, type SQL } from "drizzle-orm";
import type { RecordWithPrimaryPrediction, StoredPrediction } from "../types.ts";
import type { Db } from "./db.ts";
import { recordsWithPrimary } from "./schema.ts";

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
