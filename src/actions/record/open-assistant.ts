import { resolveAssistantModel } from "../../assistant/model-resolver.ts";
import { buildPromptInput } from "../../assistant/prompt.ts";
import { PROMPT_TEMPLATE_VERSION } from "../../assistant/prompt-template.ts";
import {
  AssistantQueryError,
  type QueryAssistantArgs,
  queryAssistant,
} from "../../assistant/provider.ts";
import { labelKey, labelName } from "../../config/config.ts";
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
  response: import("../../assistant/schema.ts").AssistantResponse;
  wasCached: boolean;
}> = queryAssistant;

export function __setAssistantQueryFn(fn: typeof queryFn | null): void {
  queryFn = fn ?? queryAssistant;
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
  binding: "i",
  // No `footer` field — `i` is a non-essential discoverability path (PRD
  // §10.5 calls assistant "optional"), so we keep the action footer
  // scannable. Reviewers learn the binding from `?` help or AGENTS.md.
  enabled: (ctx) => ctx.cursor?.current() != null,
  run: (ctx) => {
    const record = ctx.cursor?.current();
    if (!record || !ctx.queueId) return;

    if (!ctx.config.assistant?.enabled) {
      ctx.openOverlay({ kind: "configure-assistant", state: openConfigureAssistant() });
      return;
    }

    const assistant = ctx.config.assistant;
    const state = openAssistant(record.id);
    ctx.openOverlay({ kind: "assistant", state });

    let model: import("@earendil-works/pi-ai").Model<string>;
    try {
      model = resolveAssistantModel(assistant);
    } catch (err) {
      dispatchOverlayEvent(ctx, ctx.queueId, {
        kind: "streamError",
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return;
    }

    const labelNames = ctx.config.labels.map((e) => labelName(e));

    const promptInput = buildPromptInput({
      record: {
        id: record.id,
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
      predictions: predictionsForRecord(ctx.db, record.id).map((p) => ({
        label: p.label,
        source: p.source,
        confidence: p.confidence ?? undefined,
        reason: p.reason ?? undefined,
      })),
      provider: assistant.provider ?? "",
      model: assistant.model ?? "",
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
    });

    const queueId = ctx.queueId;

    void queryFn({
      db: ctx.db,
      recordId: record.id,
      assistant,
      localOnly: ctx.localOnly,
      model,
      promptInput,
      labelNames,
      onToken: (token) => {
        // Only forward tokens while this exact record's panel is still open;
        // a quick `j` navigates away and we don't want stale tokens leaking
        // into the next record's overlay.
        const cur = ctx.overlay;
        if (cur?.kind === "assistant" && cur.state.recordId === record.id) {
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
        const cur = ctx.overlay;
        if (cur?.kind === "assistant" && cur.state.recordId === record.id) {
          dispatchOverlayEvent(ctx, queueId, { kind: "streamEnd", response });
        }
      })
      .catch((err: unknown) => {
        const cur = ctx.overlay;
        if (cur?.kind === "assistant" && cur.state.recordId === record.id) {
          const message =
            err instanceof AssistantQueryError
              ? `${err.code}: ${err.message}`
              : err instanceof Error
                ? err.message
                : String(err);
          dispatchOverlayEvent(ctx, queueId, { kind: "streamError", error: new Error(message) });
        }
      });
  },
};
