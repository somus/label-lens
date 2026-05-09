import type { ReviewContext } from "../../app/context.ts";
import { insertReview } from "../../store/records.ts";
import type { Command } from "../command.ts";

export const reject: Command<ReviewContext> = {
  name: "record.reject",
  scope: "review",
  binding: "x",
  enabled: (ctx) => ctx.cursor.current() !== null,
  run: (ctx) => {
    const record = ctx.cursor.current();
    if (!record) return;
    insertReview(ctx.db, {
      record_id: record.id,
      status: "rejected",
      final_label: null,
      prev_label: record.primaryPrediction?.label ?? null,
      source_of_truth: "human",
    });
    ctx.cursor.refresh();
  },
};
