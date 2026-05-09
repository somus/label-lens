import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { RecordWithPrimaryPrediction, StoredPrediction } from "../types.ts";

type RecordWithPrimaryRow = {
  id: string;
  source_path: string;
  row_index: number;
  text: string;
  context_before: string | null;
  context_after: string | null;
  raw: string;
  primary_prediction_id: number | null;
  primary_label: string | null;
  primary_confidence: number | null;
  primary_source: string | null;
  primary_reason: string | null;
  primary_raw: string | null;
};

function hydrate(row: RecordWithPrimaryRow): RecordWithPrimaryPrediction {
  const primary: StoredPrediction | null =
    row.primary_prediction_id !== null &&
    row.primary_label !== null &&
    row.primary_source !== null &&
    row.primary_raw !== null
      ? {
          id: row.primary_prediction_id,
          record_id: row.id,
          label: row.primary_label,
          confidence: row.primary_confidence,
          source: row.primary_source,
          reason: row.primary_reason,
          raw: row.primary_raw,
        }
      : null;
  return {
    id: row.id,
    source_path: row.source_path,
    row_index: row.row_index,
    text: row.text,
    context_before: row.context_before,
    context_after: row.context_after,
    raw: row.raw,
    primaryPrediction: primary,
    latestReview: null,
  };
}

const SELECT_BASE = `
  SELECT * FROM records_with_primary
`;

const ORDER_DEFAULT = "ORDER BY row_index ASC";

export type QueueQuery = {
  where?: string;
  orderBy?: string;
  params?: SQLQueryBindings[];
  limit?: number;
};

export function queueRecords(db: Database, query: QueueQuery = {}): RecordWithPrimaryPrediction[] {
  const where = query.where ? `WHERE ${query.where}` : "";
  const order = query.orderBy ?? ORDER_DEFAULT;
  const limit = query.limit ? `LIMIT ${query.limit}` : "";
  const sql = `${SELECT_BASE} ${where} ${order} ${limit}`.trim();
  const stmt = db.query<RecordWithPrimaryRow, SQLQueryBindings[]>(sql);
  return stmt.all(...(query.params ?? [])).map(hydrate);
}

export function recordById(db: Database, id: string): RecordWithPrimaryPrediction | null {
  const row = db.query<RecordWithPrimaryRow, [string]>(`${SELECT_BASE} WHERE id = ?`).get(id);
  return row ? hydrate(row) : null;
}
