import { labelName } from "../../config/config.ts";
import { openPicker } from "../../overlay/picker.ts";
import type { Command } from "../command.ts";

export const openRelabelPicker: Command = {
  name: "record.openRelabelPicker",
  scope: "review",
  binding: "r",
  footer: { label: "relabel", order: 20 },
  enabled: (ctx) => ctx.cursor?.current() != null,
  run: (ctx) => {
    const record = ctx.cursor?.current();
    if (!record) return;
    const allLabels = ctx.config.labels.map((entry) => labelName(entry));
    const state = openPicker({
      recordId: record.id,
      allLabels,
      predicted: record.primaryPrediction?.label ?? null,
    });
    ctx.openOverlay({ kind: "picker", state });
  },
};
