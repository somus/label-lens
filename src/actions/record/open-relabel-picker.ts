import { labelKey, labelName } from "../../config/config.ts";
import { decodeExtractionObject, type ExtractionObject } from "../../labels/extraction-object.ts";
import { decodeLabelSet } from "../../labels/label-set.ts";
import { openExtractionForm } from "../../overlay/extraction-form.ts";
import { openMultiLabelPicker } from "../../overlay/multi-label-picker.ts";
import { openPicker } from "../../overlay/picker.ts";
import { currentReview } from "../../store/queries.ts";
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
    if (ctx.config.task === "multi-label") {
      const predicted = record.primaryPrediction
        ? decodeLabelSet(record.primaryPrediction.label)
        : [];
      const draft =
        ctx.multiLabelDraft && ctx.multiLabelDraft.recordId === record.id
          ? [...ctx.multiLabelDraft.selected]
          : undefined;
      const state = openMultiLabelPicker({
        recordId: record.id,
        allLabels,
        predicted,
        predictedConfidence: record.primaryPrediction?.confidence ?? null,
        assistantViewed: ctx.viewedAssistant.has(record.id),
        ...(draft ? { initialSelected: draft } : {}),
      });
      ctx.openOverlay({ kind: "multi-label-picker", state });
      return;
    }
    if (ctx.config.task === "extraction") {
      const fields = ctx.config.extraction?.fields ?? [];
      const hadPrediction = record.primaryPrediction !== null;
      const predicted: ExtractionObject = record.primaryPrediction
        ? decodeExtractionObject(record.primaryPrediction.label, fields)
        : {};
      const prior = currentReview(ctx.db, record.id);
      const previousReview: ExtractionObject | null =
        prior && prior.final_label !== null
          ? decodeExtractionObject(prior.final_label, fields)
          : null;
      const state = openExtractionForm({
        recordId: record.id,
        fields,
        predicted,
        previousReview,
        assistantViewed: ctx.viewedAssistant.has(record.id),
        hadPrediction,
      });
      ctx.openOverlay({ kind: "extraction-form", state });
      return;
    }
    const state = openPicker({
      recordId: record.id,
      allLabels,
      predicted: record.primaryPrediction?.label ?? null,
      predictedConfidence: record.primaryPrediction?.confidence ?? null,
    });
    ctx.openOverlay({ kind: "picker", state });
  },
};
