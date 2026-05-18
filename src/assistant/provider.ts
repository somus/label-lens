import { type Model, StringEnum, stream, type Tool, Type } from "@earendil-works/pi-ai";
import type { AssistantConfig } from "../config/config.ts";
import { cacheAssistantResponse, getCachedAssistantResponse } from "../store/assistant-queries.ts";
import type { Db } from "../store/db.ts";
import { envVarFor, resolveApiKey } from "./env.ts";
import { type CanonicalPromptInput, canonicalizePrompt, hashPrompt } from "./prompt.ts";
import { buildAssistantPrompt } from "./prompt-template.ts";
import { type AssistantResponse, AssistantResponseSchema, isAssistantResponse } from "./schema.ts";

const SUBMIT_TOOL_NAME = "submit_label_suggestion";

/**
 * Build the submit tool with `suggestedLabel` constrained to the actual
 * configured label set. Forcing the enum at the API level eliminates the
 * "selection mismatch" / hallucinated-label class of errors — the model
 * can only return one of our names. Falls back to the open AssistantResponseSchema
 * when labelNames is empty (testing / edge case).
 */
function buildSubmitTool(labelNames: readonly string[]): Tool {
  if (labelNames.length === 0) {
    return {
      name: SUBMIT_TOOL_NAME,
      description: "Submit your label suggestion for the candidate record. Call this exactly once.",
      parameters: AssistantResponseSchema,
    };
  }
  const ConstrainedSchema = Type.Object({
    suggestedLabel: StringEnum([...labelNames] as [string, ...string[]], {
      description: "Configured label to recommend. Must be one of the listed values.",
    }),
    confidence: StringEnum(["low", "medium", "high"], {
      description: "Assistant's confidence in its own recommendation.",
    }),
    reasoning: Type.String({
      description: "Markdown-formatted explanation of the recommendation.",
    }),
    evidenceFor: Type.Array(Type.String(), {
      description: "Short bullet phrases supporting the suggested label.",
    }),
    evidenceAgainst: Type.Array(Type.String(), {
      description: "Short bullet phrases against the suggested label.",
    }),
    recommendedAction: StringEnum(["accept", "relabel", "reject", "skip"], {
      description: "How the reviewer should commit.",
    }),
  });
  return {
    name: SUBMIT_TOOL_NAME,
    description: "Submit your label suggestion for the candidate record. Call this exactly once.",
    parameters: ConstrainedSchema,
  };
}

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
  /** Names from `config.labels[].name`; used to reject hallucinated `suggestedLabel` values before caching. */
  labelNames: readonly string[];
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
    | "invalid-label"
    | "no-tool-call"
    | "provider-error";
  constructor(code: AssistantQueryError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "AssistantQueryError";
  }
}

function isRemoteProvider(provider: string): boolean {
  // Ollama is the only provider that doesn't leave the machine; matches
  // validateLocalOnly() in src/config/config.ts. Anything else (including
  // misconfigured strings like "local") is treated as remote so the privacy
  // gate + --local-only check still fire.
  return provider !== "ollama";
}

/**
 * Main entry. Cache-checks (record_id, prompt_hash); on hit returns
 * synchronously without touching the network. On miss validates config +
 * privacy + --local-only, calls pi-ai with the structured-output tool,
 * extracts the tool arguments, validates against the schema, caches, and
 * resolves. Errors throw `AssistantQueryError` with a machine-readable
 * `code` so the UI can branch (open the configure overlay, surface a
 * privacy-gate banner, etc.).
 *
 * ADR 0004: callers must tag the associated review entry's `source_of_truth`
 * as `human+assistant` whenever this function is invoked for a record — the
 * act of viewing the assistant panel (accepted, dismissed, or relabel) is
 * what triggers the tag. This function returns the response only; slice 11C
 * applies the audit tag at the overlay seam.
 */
export async function queryAssistant(args: QueryAssistantArgs): Promise<QueryAssistantResult> {
  const {
    db,
    recordId,
    assistant,
    localOnly,
    model,
    promptInput,
    labelNames,
    onToken,
    onPrivacyGate,
    signal,
  } = args;

  const promptHash = hashPrompt(canonicalizePrompt(promptInput));

  // Cache hit short-circuits — no config check, no network. Three deliberate
  // consequences: (1) disabling the assistant leaves cached rows readable on
  // re-enable; (2) switching provider local↔remote does not invalidate prior
  // rows; (3) revoking privacyAcknowledged does not purge cached remote rows.
  // All three are acceptable per PRD §10.5 — cache is content-addressed by
  // prompt_hash, not by current config state.
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
  // once. The tool's `suggestedLabel` parameter is a StringEnum over the
  // configured labels so the model can't hallucinate names that aren't in
  // config.labels.
  const tool = buildSubmitTool(labelNames);
  const ctx = {
    systemPrompt,
    messages: [{ role: "user" as const, content: userPrompt, timestamp: Date.now() }],
    tools: [tool],
  };

  // Resolve apiKey from the configured env var first, then pi-ai's canonical
  // per-provider name as a fallback. Without this, configs saved by an older
  // wizard run (which set apiKeyEnvVar=GOOGLE_API_KEY for Google) would never
  // pick up the user's actual GEMINI_API_KEY exported per Google's own docs
  // and pi-ai's table.
  const apiKey = remote ? resolveApiKey(assistant.provider, assistant.apiKeyEnvVar) : undefined;
  if (remote && !apiKey) {
    const tried = [assistant.apiKeyEnvVar, envVarFor(assistant.provider)]
      .filter((v): v is string => Boolean(v))
      .filter((v, i, a) => a.indexOf(v) === i);
    throw new AssistantQueryError(
      "no-provider",
      `No API key found. Export one of: ${tried.join(" or ")}`,
    );
  }
  const s = stream(model, ctx, apiKey ? { signal, apiKey } : { signal });

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
  if (!labelNames.includes(response.suggestedLabel)) {
    // Hallucinated label — do NOT cache. Re-query has a chance of getting a
    // valid response; caching here would poison the (record_id, prompt_hash)
    // slot until the prompt template version bumps.
    throw new AssistantQueryError(
      "invalid-label",
      `Model suggested label '${response.suggestedLabel}' is not in config.labels.`,
    );
  }
  cacheAssistantResponse(db, recordId, promptHash, response);
  return { response, wasCached: false };
}

// Re-export for callers that want to inspect the canonical schema
// (e.g. ADR diagnostics).
export { AssistantResponseSchema, SUBMIT_TOOL_NAME, Type };
