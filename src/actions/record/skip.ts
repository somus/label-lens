import type { ReviewContext } from "../../app/context.ts";
import { insertReview } from "../../store/records.ts";
import type { Command } from "../command.ts";

export const skip: Command<ReviewContext> = {
  name: "record.skip",
  scope: "review",
  binding: "s",
  enabled: (ctx) => ctx.cursor.current() !== null,
  run: (ctx) => {
    const record = ctx.cursor.current();
    if (!record) return;
    insertReview(ctx.db, {
      record_id: record.id,
      status: "skipped",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });
    ctx.cursor.refresh();
  },
};
