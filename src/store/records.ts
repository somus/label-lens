import type { Database } from "bun:sqlite";
import type { ReviewStatus, SourceOfTruth, StoredRecord } from "../types.ts";

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
