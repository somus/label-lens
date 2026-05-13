import { asc } from "drizzle-orm";
import type { Db } from "../store/db.ts";
import { reviews } from "../store/schema.ts";

// PRD §11.2 specifies a `note` field on ReviewEntry, but the current schema
// stores `note` on `records` (mutable, per-record), not on `reviews`. Joining
// `records.note` here would emit the *current* note on every historical review
// row — corrupting the audit trail when a note is edited between reviews. We
// omit `note` until the schema gains a per-review note column. Follow-up
// tracked in #36.
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
    })
    .from(reviews)
    .orderBy(asc(reviews.reviewedAt), asc(reviews.id))
    .all();
  if (rows.length === 0) return "";
  return `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
}
