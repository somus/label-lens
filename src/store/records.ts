import { eq } from "drizzle-orm";
import type { ReviewStatus, SourceOfTruth } from "../types.ts";
import type { TxOrDb } from "./db.ts";
import {
  issues,
  type NewPrediction,
  type NewRecord,
  predictions,
  records,
  reviews,
} from "./schema.ts";

export type RecordPredictionInput = Omit<NewPrediction, "id" | "recordId">;

export type RecordIssueInput = {
  type: string;
  score?: number | null;
  source?: string | null;
};

export function insertRecord(
  db: TxOrDb,
  rec: NewRecord & {
    predictions: RecordPredictionInput[];
    issues?: RecordIssueInput[];
  },
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

  for (const p of rec.predictions) {
    db.insert(predictions)
      .values({ ...p, recordId: rec.id })
      .run();
  }

  if (rec.issues && rec.issues.length > 0) {
    const now = new Date().toISOString();
    for (const i of rec.issues) {
      db.insert(issues)
        .values({
          recordId: rec.id,
          type: i.type,
          score: i.score ?? null,
          source: i.source ?? null,
          createdAt: now,
        })
        .run();
    }
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
    source_of_truth: SourceOfTruth;
    batch_id?: string | null;
  },
): void {
  const noteRow = db
    .select({ note: records.note })
    .from(records)
    .where(eq(records.id, args.record_id))
    .get();
  db.insert(reviews)
    .values({
      recordId: args.record_id,
      status: args.status,
      finalLabel: args.final_label,
      prevLabel: args.prev_label,
      reviewedAt: new Date().toISOString(),
      sourceOfTruth: args.source_of_truth,
      note: noteRow?.note ?? null,
      batchId: args.batch_id ?? null,
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
