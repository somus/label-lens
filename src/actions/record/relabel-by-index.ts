import type { ReviewContext } from "../../app/context.ts";
import { labelName } from "../../config/config.ts";
import { insertReview } from "../../store/records.ts";
import type { Command } from "../command.ts";

export function relabelByIndexCommand(n: number): Command<ReviewContext> {
  const key = String(n);
  return {
    name: `record.relabelByIndex.${n}`,
    scope: "review",
    binding: key,
    enabled: (ctx) => ctx.cursor.current() !== null,
    run: (ctx) => {
      const record = ctx.cursor.current();
      if (!record) return;
      const entry = ctx.config.labels[n - 1];
      if (!entry) {
        ctx.setFlash(`No label at position ${n}`, "error");
        return;
      }
      const label = labelName(entry);
      const predicted = record.primaryPrediction?.label ?? null;
      const status = predicted === label ? "accepted" : "relabeled";
      insertReview(ctx.db, {
        record_id: record.id,
        status,
        final_label: label,
        prev_label: status === "relabeled" ? predicted : null,
        source_of_truth: "human",
      });
      ctx.cursor.refresh();
    },
  };
}

export const relabelByIndexCommands: Command<ReviewContext>[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(
  (n) => relabelByIndexCommand(n),
);
