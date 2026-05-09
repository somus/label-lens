import type { Database } from "bun:sqlite";
import type {
  ReviewStatus,
  SourceOfTruth,
  StoredPrediction,
  StoredRecord,
  StoredReview,
} from "../types.ts";

export function insertRecord(
  db: Database,
  rec: StoredRecord & {
    predictions: {
      label: string;
      confidence: number | null;
      source: string;
      reason: string | null;
      raw: string;
    }[];
  },
): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO records (id, source_path, row_index, text, context_before, context_after, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    rec.id,
    rec.source_path,
    rec.row_index,
    rec.text,
    rec.context_before,
    rec.context_after,
    rec.raw,
  );

  if (rec.predictions.length === 0) return;
  const insertPred = db.prepare(`
    INSERT INTO predictions (record_id, label, confidence, source, reason, raw)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const p of rec.predictions) {
    insertPred.run(rec.id, p.label, p.confidence, p.source, p.reason, p.raw);
  }
}

export type RecordWithPrimaryPrediction = StoredRecord & {
  primaryPrediction: StoredPrediction | null;
  latestReview: StoredReview | null;
};

export function listPendingRecords(db: Database, limit = 1000): RecordWithPrimaryPrediction[] {
  const rows = db
    .query<
      StoredRecord & {
        pred_id: number | null;
        pred_label: string | null;
        pred_confidence: number | null;
        pred_source: string | null;
        pred_reason: string | null;
        pred_raw: string | null;
      },
      [number]
    >(
      `
      SELECT r.*,
             p.id          AS pred_id,
             p.label       AS pred_label,
             p.confidence  AS pred_confidence,
             p.source      AS pred_source,
             p.reason      AS pred_reason,
             p.raw         AS pred_raw
      FROM records r
      LEFT JOIN (
        SELECT * FROM predictions
        ORDER BY (confidence IS NULL), confidence DESC, id ASC
      ) p ON p.record_id = r.id
      WHERE NOT EXISTS (SELECT 1 FROM reviews v WHERE v.record_id = r.id)
      GROUP BY r.id
      ORDER BY r.row_index ASC
      LIMIT ?
      `,
    )
    .all(limit);

  return rows.map((row) => {
    const primary: StoredPrediction | null =
      row.pred_id !== null &&
      row.pred_label !== null &&
      row.pred_source !== null &&
      row.pred_raw !== null
        ? {
            id: row.pred_id,
            record_id: row.id,
            label: row.pred_label,
            confidence: row.pred_confidence,
            source: row.pred_source,
            reason: row.pred_reason,
            raw: row.pred_raw,
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
  });
}

export function insertReview(
  db: Database,
  args: {
    record_id: string;
    status: ReviewStatus;
    final_label: string | null;
    prev_label: string | null;
    note: string | null;
    source_of_truth: SourceOfTruth;
  },
): void {
  db.prepare(
    `INSERT INTO reviews (record_id, status, final_label, prev_label, note, reviewed_at, source_of_truth)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    args.record_id,
    args.status,
    args.final_label,
    args.prev_label,
    args.note,
    new Date().toISOString(),
    args.source_of_truth,
  );
}

export function progressCounts(db: Database): {
  total: number;
  reviewed: number;
  pending: number;
} {
  const total = (db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM records").get() ?? { n: 0 })
    .n;
  const reviewed = (
    db
      .query<{ n: number }, []>(
        `SELECT COUNT(DISTINCT record_id) AS n FROM reviews WHERE status IN ('accepted','relabeled','rejected')`,
      )
      .get() ?? { n: 0 }
  ).n;
  return { total, reviewed, pending: total - reviewed };
}
