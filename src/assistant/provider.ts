import { type Model, stream, type Tool, Type } from "@earendil-works/pi-ai";
import type { AssistantConfig } from "../config/config.ts";
import { cacheAssistantResponse, getCachedAssistantResponse } from "../store/assistant-queries.ts";
import type { Db } from "../store/db.ts";
import { type CanonicalPromptInput, canonicalizePrompt, hashPrompt } from "./prompt.ts";
import { buildAssistantPrompt } from "./prompt-template.ts";
import { type AssistantResponse, AssistantResponseSchema, isAssistantResponse } from "./schema.ts";

const SUBMIT_TOOL_NAME = "submit_label_suggestion";

const submitTool: Tool = {
  name: SUBMIT_TOOL_NAME,
  description: "Submit your label suggestion for the candidate record. Call this exactly once.",
  parameters: AssistantResponseSchema,
};

export type QueryAssistantArgs = {
  db: Db;
  /** Record id used as the cache key alongside `prompt_hash`. */
  recordId: string;
  /** Provider config slice (`config.assistant`). */
  assistant: AssistantConfig;
  /** True when `--local-only` was set on the CLI. */
  localOnly: boolean;
  /** Resolved pi-ai model (caller resolves from `assistant.provider` + `assistant.model`). */
  model: Model<string>;
  /** Canonical prompt input; we hash + assemble the model prompt from this. */
  promptInput: CanonicalPromptInput;
  /** Receives each text-delta token as the model streams. Caller renders into footer / reasoning buffer. */
  onToken?: (token: string) => void;
  /** Notified once when the privacy gate forces a halt — UI prompts the reviewer to acknowledge. */
  onPrivacyGate?: () => void;
  /** Cooperative cancellation. Passed through to pi-ai. */
  signal?: AbortSignal;
};

export type QueryAssistantResult = {
  response: AssistantResponse;
  wasCached: boolean;
};

export class AssistantQueryError extends Error {
  readonly code:
    | "not-enabled"
    | "no-provider"
    | "local-only-violation"
    | "privacy-gate"
    | "schema-mismatch"
    | "no-tool-call"
    | "provider-error";
  constructor(code: AssistantQueryError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "AssistantQueryError";
  }
}

function isRemoteProvider(provider: string): boolean {
  return provider !== "ollama" && provider !== "local";
}

/**
 * Main entry. Cache-checks (record_id, prompt_hash); on hit returns
 * synchronously without touching the network. On miss validates config +
 * privacy + --local-only, calls pi-ai with the structured-output tool,
 * extracts the tool arguments, validates against the schema, caches, and
 * resolves. Errors throw `AssistantQueryError` with a machine-readable
 * `code` so the UI can branch (open the configure overlay, surface a
 * privacy-gate banner, etc.).
 */
export async function queryAssistant(args: QueryAssistantArgs): Promise<QueryAssistantResult> {
  const { db, recordId, assistant, localOnly, model, promptInput, onToken, onPrivacyGate, signal } =
    args;

  const promptHash = hashPrompt(canonicalizePrompt(promptInput));

  // Cache hit short-circuits — no config check, no network. Reviewer toggles
  // (enable/disable) leave cached rows intact; a fresh enable reuses them.
  const cached = getCachedAssistantResponse(db, recordId, promptHash);
  if (cached) return { response: cached, wasCached: true };

  if (!assistant.enabled) {
    throw new AssistantQueryError("not-enabled", "Assistant is disabled in config.");
  }
  if (!assistant.provider) {
    throw new AssistantQueryError("no-provider", "Assistant provider is not configured.");
  }

  const remote = isRemoteProvider(assistant.provider);

  if (localOnly && remote) {
    throw new AssistantQueryError(
      "local-only-violation",
      `--local-only set but provider '${assistant.provider}' is remote.`,
    );
  }

  if (remote && !assistant.privacyAcknowledged) {
    onPrivacyGate?.();
    throw new AssistantQueryError(
      "privacy-gate",
      "Privacy notice not acknowledged; first remote call blocked.",
    );
  }

  const { systemPrompt, userPrompt } = buildAssistantPrompt(promptInput);

  // Tool-only structured output: instruct the model to call submitTool exactly
  // once. pi-ai validates the tool arguments against AssistantResponseSchema
  // during the toolcall_end event.
  const ctx = {
    systemPrompt,
    messages: [{ role: "user" as const, content: userPrompt, timestamp: Date.now() }],
    tools: [submitTool],
  };

  const s = stream(model, ctx, { signal });

  let finalToolCall: { name: string; arguments: Record<string, unknown> } | null = null;

  try {
    for await (const event of s) {
      switch (event.type) {
        case "text_delta":
        case "thinking_delta":
          onToken?.(event.delta);
          break;
        case "toolcall_end":
          if (event.toolCall.name === SUBMIT_TOOL_NAME) {
            finalToolCall = {
              name: event.toolCall.name,
              arguments: event.toolCall.arguments,
            };
          }
          break;
        case "error":
          throw new AssistantQueryError(
            "provider-error",
            event.error.errorMessage ?? `provider stream error (${event.reason})`,
          );
      }
    }
  } catch (err) {
    if (err instanceof AssistantQueryError) throw err;
    throw new AssistantQueryError(
      "provider-error",
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!finalToolCall) {
    throw new AssistantQueryError(
      "no-tool-call",
      `Model finished without calling ${SUBMIT_TOOL_NAME}.`,
    );
  }
  if (!isAssistantResponse(finalToolCall.arguments)) {
    throw new AssistantQueryError(
      "schema-mismatch",
      `${SUBMIT_TOOL_NAME} arguments do not match AssistantResponseSchema.`,
    );
  }

  const response = finalToolCall.arguments as AssistantResponse;
  cacheAssistantResponse(db, recordId, promptHash, response);
  return { response, wasCached: false };
}

// Re-export for callers that want to build the Tool elsewhere or inspect the
// canonical schema (e.g. ADR diagnostics).
export { AssistantResponseSchema, SUBMIT_TOOL_NAME, submitTool, Type };
