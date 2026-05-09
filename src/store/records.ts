import { eq } from "drizzle-orm";
import type { ReviewStatus, SourceOfTruth } from "../types.ts";
import type { TxOrDb } from "./db.ts";
import { type NewPrediction, type NewRecord, predictions, records, reviews } from "./schema.ts";

export type RecordPredictionInput = Omit<NewPrediction, "id" | "recordId">;

export function insertRecord(
  db: TxOrDb,
  rec: NewRecord & { predictions: RecordPredictionInput[] },
): void {
  db.insert(records)
    .values({
      id: rec.id,
      sourcePath: rec.sourcePath,
      rowIndex: rec.rowIndex,
      text: rec.text,
      contextBefore: rec.contextBefore ?? null,
      contextAfter: rec.contextAfter ?? null,
      raw: rec.raw,
    })
    .onConflictDoNothing()
    .run();

  if (rec.predictions.length === 0) return;
  for (const p of rec.predictions) {
    db.insert(predictions)
      .values({ ...p, recordId: rec.id })
      .run();
  }
}

export type StoredReviewStatus = Exclude<ReviewStatus, "pending">;

export function insertReview(
  db: TxOrDb,
  args: {
    record_id: string;
    status: StoredReviewStatus;
    final_label: string | null;
    prev_label: string | null;
    note: string | null;
    source_of_truth: SourceOfTruth;
  },
): void {
  db.insert(reviews)
    .values({
      recordId: args.record_id,
      status: args.status,
      finalLabel: args.final_label,
      prevLabel: args.prev_label,
      note: args.note,
      reviewedAt: new Date().toISOString(),
      sourceOfTruth: args.source_of_truth,
    })
    .run();
}

/** Update a record's note column. Empty string is stored as NULL. */
export function updateRecordNote(db: TxOrDb, recordId: string, note: string): void {
  db.update(records)
    .set({ note: note.length === 0 ? null : note })
    .where(eq(records.id, recordId))
    .run();
}
