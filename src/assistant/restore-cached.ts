import { type LabellensConfig, labelName } from "../config/config.ts";
import { decodeExtractionObject, type ExtractionObject } from "../labels/extraction-object.ts";
import { decodeLabelSet, normalizeLabelSet } from "../labels/label-set.ts";
import type { AssistantState } from "../overlay/types.ts";
import { getLatestCachedAssistantResponse } from "../store/assistant-queries.ts";
import type { Db } from "../store/db.ts";
import type { RecordWithPrimaryPrediction } from "../types.ts";
import { isAssistantExtractionResponse, isAssistantMultiLabelResponse } from "./schema.ts";

/**
 * Build a done-state `AssistantState` from the most recent cached
 * response for `record`. Returns `null` when no cached row exists or
 * its stored shape is incompatible with the current task. Used by the
 * review screen to auto-display previously-queried suggestions on
 * focus — including after an app restart — without firing a new
 * provider call.
 *
 * The task-specific context fields (`multiLabel`, `extraction`) are
 * rebuilt from the live config + record so the strip's render layer
 * has everything it needs to format the suggestion preview.
 */
export function restoreCachedAssistantState(
  db: Db,
  config: LabellensConfig,
  record: RecordWithPrimaryPrediction,
): AssistantState | null {
  const cached = getLatestCachedAssistantResponse(db, record.id);
  if (!cached) return null;
  const predictedLabel = record.primaryPrediction?.label ?? null;
  const isMultiLabel = config.task === "multi-label";
  const isExtraction = config.task === "extraction";

  if (isExtraction) {
    if (!isAssistantExtractionResponse(cached)) return null;
    const fields = config.extraction?.fields ?? [];
    const predictedObject: ExtractionObject = record.primaryPrediction
      ? decodeExtractionObject(record.primaryPrediction.label, fields)
      : {};
    const suggestionObject: ExtractionObject = {};
    for (const f of fields) {
      const v = cached.extractedObject[f.name];
      suggestionObject[f.name] = typeof v === "string" ? v : null;
    }
    return {
      recordId: record.id,
      predictedLabel,
      reasoningExpanded: false,
      status: "done",
      suggestion: "",
      suggestionObject,
      confidence: cached.confidence,
      recommendedAction: cached.recommendedAction,
      reason: cached.reasoning,
      extraction: { fields, predictedObject, hadPrediction: record.primaryPrediction !== null },
    };
  }

  if (isMultiLabel) {
    if (!isAssistantMultiLabelResponse(cached)) return null;
    const configuredLabels = config.labels.map((e) => labelName(e));
    const predictedSet = record.primaryPrediction
      ? decodeLabelSet(record.primaryPrediction.label)
      : [];
    const norm = normalizeLabelSet(cached.suggestedLabels, configuredLabels);
    return {
      recordId: record.id,
      predictedLabel,
      reasoningExpanded: false,
      status: "done",
      suggestion: "",
      suggestionSet: norm.set,
      confidence: cached.confidence,
      recommendedAction: cached.recommendedAction,
      reason: cached.reasoning,
      multiLabel: { configuredLabels, predictedSet },
    };
  }

  // Single-label (classification / boundary).
  if ("suggestedLabel" in cached && typeof cached.suggestedLabel === "string") {
    return {
      recordId: record.id,
      predictedLabel,
      reasoningExpanded: false,
      status: "done",
      suggestion: cached.suggestedLabel,
      confidence: cached.confidence,
      recommendedAction: cached.recommendedAction,
      reason: cached.reasoning,
    };
  }
  return null;
}
