import { asc } from "drizzle-orm";
import type { Db } from "../store/db.ts";
import { reviews } from "../store/schema.ts";

export function exportReviewLogString(db: Db): string {
  const rows = db
    .select({
      id: reviews.id,
      record_id: reviews.recordId,
      status: reviews.status,
      final_label: reviews.finalLabel,
      prev_label: reviews.prevLabel,
      reviewed_at: reviews.reviewedAt,
      source_of_truth: reviews.sourceOfTruth,
      compensates_review_id: reviews.compensatesReviewId,
      note: reviews.note,
      batch_id: reviews.batchId,
    })
    .from(reviews)
    .orderBy(asc(reviews.reviewedAt), asc(reviews.id))
    .all();
  if (rows.length === 0) return "";
  return `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
}
