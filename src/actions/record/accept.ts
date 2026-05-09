import type { ReviewContext } from "../../app/context.ts";
import { insertReview } from "../../store/records.ts";
import type { Command } from "../command.ts";

export const accept: Command<ReviewContext> = {
  name: "record.accept",
  scope: "review",
  binding: "a",
  enabled: (ctx) => ctx.cursor.current() !== null,
  run: (ctx) => {
    const record = ctx.cursor.current();
    if (!record) return;
    insertReview(ctx.db, {
      record_id: record.id,
      status: "accepted",
      final_label: record.primaryPrediction?.label ?? null,
      prev_label: null,
      note: null,
      source_of_truth: "human",
    });
    ctx.cursor.refresh();
  },
};
