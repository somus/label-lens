import { resolveAssistantModel } from "../../assistant/model-resolver.ts";
import { buildPromptInput } from "../../assistant/prompt.ts";
import { PROMPT_TEMPLATE_VERSION } from "../../assistant/prompt-template.ts";
import {
  AssistantQueryError,
  type QueryAssistantArgs,
  queryAssistant,
} from "../../assistant/provider.ts";
import { labelKey, labelName } from "../../config/config.ts";
import { decodeExtractionObject } from "../../labels/extraction-object.ts";
import { decodeLabelSet } from "../../labels/label-set.ts";
import { openAssistant } from "../../overlay/assistant.ts";
import { openConfigureAssistant } from "../../overlay/configure-assistant.ts";
import { dispatchOverlayEvent } from "../../overlay/effects.ts";
import { predictionsForRecord } from "../../store/queries.ts";
import type { Command } from "../command.ts";

/**
 * Hook for tests: replace `queryAssistant` so we can pin a deterministic
 * response without touching real providers. Production wires through to
 * the real implementation; tests reset it in afterEach.
 */
let queryFn: (args: QueryAssistantArgs) => Promise<{
  response: import("../../assistant/schema.ts").AssistantResponseAny;
  wasCached: boolean;
}> = queryAssistant;

export function __setAssistantQueryFn(fn: typeof queryFn | null): void {
  queryFn = fn ?? queryAssistant;
}

export function __getAssistantQueryFn(): typeof queryFn {
  return queryFn;
}

/**
 * `i` opens the inline assistant footer for the focused record. First press
 * with `assistant.enabled = false` redirects into the configure overlay
 * (PRD §10.5 first-press flow). Subsequent presses fire `queryAssistant`
 * and stream tokens into the overlay reducer.
 */
export const openAssistantCommand: Command = {
  name: "record.openAssistant",
  scope: "review",
  bindings: { vim: "i" },
  // Short footer label keeps the row scannable on 120-col terminals; `?`
  // help spells it out as "inquire (LLM assistant)".
  footer: { label: "ask", order: 25 },
  enabled: (ctx) => ctx.cursor?.current() != null,
  run: (ctx) => {
    const record = ctx.cursor?.current();
    if (!record || !ctx.queueId) return;

    if (!ctx.config.assistant?.enabled) {
      ctx.openOverlay({ kind: "configure-assistant", state: openConfigureAssistant() });
      return;
    }

    const assistant = ctx.config.assistant;
    // Capture record + queue identity at fire time so closures below don't
    // race against rapid j/k navigation (A → B → A would otherwise let stale
    // tokens leak into a re-opened overlay for the same record).
    const fireRecordId = record.id;
    const queueId = ctx.queueId;
    const predictedLabel = record.primaryPrediction?.label ?? null;
    const isMultiLabel = ctx.config.task === "multi-label";
    const isExtraction = ctx.config.task === "extraction";
    const predictedSet =
      isMultiLabel && record.primaryPrediction
        ? decodeLabelSet(record.primaryPrediction.label)
        : [];
    const extractionFields = ctx.config.extraction?.fields ?? [];
    const predictedExtractionObject =
      isExtraction && record.primaryPrediction
        ? decodeExtractionObject(record.primaryPrediction.label, extractionFields)
        : {};
    const configuredLabels = ctx.config.labels.map((e) => labelName(e));

    // Cancel any prior in-flight assistant request before we fire a new one.
    // Otherwise rapid `i` presses across records (each with its own pi-ai
    // stream) leave abandoned network calls burning quota.
    ctx.cancelAssistantStream();
    const controller = new AbortController();
    ctx.assistantAbort = { recordId: fireRecordId, controller };

    const openOptions = isMultiLabel
      ? { multiLabel: { configuredLabels, predicted: predictedSet } }
      : isExtraction
        ? {
            extraction: {
              fields: extractionFields,
              predictedObject: predictedExtractionObject,
            },
          }
        : undefined;
    const state = openAssistant(fireRecordId, predictedLabel, openOptions);
    ctx.openOverlay({ kind: "assistant", state });

    let model: import("@earendil-works/pi-ai").Model<string>;
    try {
      model = resolveAssistantModel(assistant);
    } catch (err) {
      dispatchOverlayEvent(ctx, queueId, {
        kind: "streamError",
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return;
    }

    const labelNames = configuredLabels;

    const promptInput = buildPromptInput({
      record: {
        id: fireRecordId,
        text: record.text,
        context_before: record.context_before,
        context_after: record.context_after,
      },
      task: ctx.config.task,
      labels: ctx.config.labels.map((entry) => {
        const def: { name: string; definition?: string } = { name: labelName(entry) };
        const k = labelKey(entry);
        if (k) def.definition = `keybinding: ${k}`;
        return def;
      }),
      guidelines: ctx.config.guidelines ?? "",
      predictions: predictionsForRecord(ctx.db, fireRecordId).map((p) => ({
        label: p.label,
        source: p.source,
        confidence: p.confidence ?? undefined,
        reason: p.reason ?? undefined,
      })),
      provider: assistant.provider ?? "",
      model: assistant.model ?? "",
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
      systemPromptAppend: assistant.systemPromptAppend,
    });

    const isStillFocused = (): boolean => {
      const cur = ctx.overlay;
      return cur?.kind === "assistant" && cur.state.recordId === fireRecordId;
    };
    const clearOwnAbort = () => {
      if (ctx.assistantAbort?.controller === controller) ctx.assistantAbort = null;
    };

    void queryFn({
      db: ctx.db,
      recordId: fireRecordId,
      assistant,
      localOnly: ctx.localOnly,
      model,
      promptInput,
      labelNames,
      multiLabel: isMultiLabel,
      ...(isExtraction ? { extraction: { fields: extractionFields } } : {}),
      signal: controller.signal,
      onToken: (token) => {
        // Only forward tokens while this exact record's panel is still open;
        // navigating away cancels the stream above, but a token already in
        // flight could still arrive before the abort propagates.
        if (isStillFocused()) {
          dispatchOverlayEvent(ctx, queueId, { kind: "streamToken", token });
        }
      },
      onPrivacyGate: () => {
        // Should be unreachable when the configure flow ran — the flow sets
        // privacyAcknowledged. Defensive: re-open the configure overlay.
        ctx.openOverlay({ kind: "configure-assistant", state: openConfigureAssistant() });
      },
    })
      .then(({ response }) => {
        clearOwnAbort();
        if (isStillFocused()) {
          dispatchOverlayEvent(ctx, queueId, { kind: "streamEnd", response });
        }
      })
      .catch((err: unknown) => {
        clearOwnAbort();
        // Aborts are caused by us (nav / re-fire); don't surface them as errors.
        if (controller.signal.aborted) return;
        if (!isStillFocused()) return;
        const message =
          err instanceof AssistantQueryError
            ? `${err.code}: ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
        dispatchOverlayEvent(ctx, queueId, { kind: "streamError", error: new Error(message) });
      });
  },
};
