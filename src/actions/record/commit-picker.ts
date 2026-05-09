import type { ReviewContext } from "../../app/context.ts";
import { insertReview } from "../../store/records.ts";

/**
 * Commit the highlighted picker label as the record's review.
 * Picker selection equal to the predicted label is recorded as `accepted`;
 * otherwise as `relabeled`. No-ops if picker state is missing or empty.
 */
export function commitPickerSelection(ctx: ReviewContext): void {
  const picker = ctx.picker;
  if (!picker) return;
  const candidate = picker.candidates[picker.highlight];
  if (!candidate) return;
  const record = ctx.cursor.current();
  if (!record || record.id !== picker.recordId) {
    ctx.exitOverlay();
    return;
  }
  const predicted = record.primaryPrediction?.label ?? null;
  const status = predicted === candidate.label ? "accepted" : "relabeled";
  insertReview(ctx.db, {
    record_id: record.id,
    status,
    final_label: candidate.label,
    prev_label: status === "relabeled" ? predicted : null,
    source_of_truth: "human",
  });
  ctx.exitOverlay();
  ctx.cursor.refresh();
}
