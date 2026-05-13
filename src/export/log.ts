import { asc, eq } from "drizzle-orm";
import type { Db } from "../store/db.ts";
import { records, reviews } from "../store/schema.ts";

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
      note: records.note,
    })
    .from(reviews)
    .innerJoin(records, eq(reviews.recordId, records.id))
    .orderBy(asc(reviews.reviewedAt), asc(reviews.id))
    .all();
  if (rows.length === 0) return "";
  return `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
}
