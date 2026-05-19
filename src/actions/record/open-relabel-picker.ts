import { labelKey, labelName } from "../../config/config.ts";
import { openPicker } from "../../overlay/picker.ts";
import type { Command } from "../command.ts";

export const openRelabelPicker: Command = {
  name: "record.openRelabelPicker",
  scope: "review",
  bindings: { vim: "r" },
  footer: { label: "relabel", order: 20 },
  enabled: (ctx) => ctx.cursor?.current() != null,
  run: (ctx) => {
    const record = ctx.cursor?.current();
    if (!record) return;
    const allLabels = ctx.config.labels.map((entry) => {
      const key = labelKey(entry);
      return key === null ? { name: labelName(entry) } : { name: labelName(entry), key };
    });
    const state = openPicker({
      recordId: record.id,
      allLabels,
      predicted: record.primaryPrediction?.label ?? null,
      predictedConfidence: record.primaryPrediction?.confidence ?? null,
    });
    ctx.openOverlay({ kind: "picker", state });
  },
};
