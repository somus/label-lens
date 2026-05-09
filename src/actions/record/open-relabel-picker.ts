import type { PickerCandidate, ReviewContext } from "../../app/context.ts";
import { labelName } from "../../config/config.ts";
import type { Command } from "../command.ts";

export const openRelabelPicker: Command<ReviewContext> = {
  name: "record.openRelabelPicker",
  scope: "review",
  binding: "r",
  enabled: (ctx) => ctx.cursor.current() !== null,
  run: (ctx) => {
    const record = ctx.cursor.current();
    if (!record) return;
    const predicted = record.primaryPrediction?.label ?? null;
    const candidates: PickerCandidate[] = ctx.config.labels.map((entry) => {
      const label = labelName(entry);
      return { label, predicted: label === predicted };
    });
    const predictedIdx = candidates.findIndex((c) => c.predicted);
    ctx.enterPicker({
      recordId: record.id,
      allLabels: candidates.map((c) => c.label),
      predicted,
      filter: "",
      candidates,
      highlight: predictedIdx >= 0 ? predictedIdx : 0,
    });
  },
};
