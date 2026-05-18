import { envVarFor } from "../assistant/env.ts";
import type { AssistantConfig } from "../config/config.ts";
import { keepPrintableInputChars } from "./input-filter.ts";
import type {
  ConfigureAssistantState,
  Effect,
  Overlay,
  OverlayEvent,
  ReduceResult,
} from "./types.ts";

/**
 * Provider matrix offered in the configure overlay (PRD §10.5). MVP supports
 * api-key (remote) and Ollama (local) — subscription OAuth deferred to V1
 * (pi#2163 SSH callback issue). Order is stable; reviewers pick by digit.
 */
export const CONFIGURE_PROVIDERS: { slug: string; label: string }[] = [
  { slug: "anthropic", label: "Anthropic (API key)" },
  { slug: "openai", label: "OpenAI (API key)" },
  { slug: "google", label: "Google (API key)" },
  { slug: "groq", label: "Groq (API key)" },
  { slug: "ollama", label: "Ollama (local)" },
];

export function openConfigureAssistant(): ConfigureAssistantState {
  return { step: "provider" };
}

function isLocalProvider(slug: string): boolean {
  return slug === "ollama";
}

function packed(state: ConfigureAssistantState): Overlay {
  return { kind: "configure-assistant", state };
}

function defaultModelFor(provider: string): string | undefined {
  switch (provider) {
    case "anthropic":
      return "claude-sonnet-4-5";
    case "openai":
      return "gpt-4o-mini";
    case "google":
      return "gemini-2.5-flash";
    case "groq":
      return "llama-3.1-70b-versatile";
    case "ollama":
      return "llama3.1";
    default:
      return undefined;
  }
}

export { envVarFor } from "../assistant/env.ts";

function commitConfig(state: ConfigureAssistantState): ReduceResult {
  const provider = state.selectedProvider!;
  const local = isLocalProvider(provider);
  const assistant: AssistantConfig = {
    enabled: true,
    provider,
    privacyAcknowledged: local ? true : Boolean(state.privacyConfirmed),
  };
  const model = defaultModelFor(provider);
  if (model) assistant.model = model;
  if (local) {
    if (state.ollamaUrl) assistant.ollamaUrl = state.ollamaUrl;
  } else {
    // Env var name matches pi-ai's own convention per provider (see
    // envVarFor). The typed key is exported into the active process via
    // the effect handler (session only; never persisted to disk).
    // Reviewer is told to export the same env var in their shell for the
    // next launch.
    assistant.apiKeyEnvVar = envVarFor(provider);
  }
  const effect: Effect = local
    ? { kind: "updateAssistantConfig", assistant }
    : { kind: "updateAssistantConfig", assistant, sessionApiKey: state.apiKey };
  const effects: Effect[] = [effect, { kind: "close" }];
  return { overlay: null, effects };
}

export function reduceConfigureAssistant(
  state: ConfigureAssistantState,
  event: OverlayEvent,
): ReduceResult {
  switch (event.kind) {
    case "cancel":
      return { overlay: null, effects: [{ kind: "close" }] };
    case "streamToken":
    case "streamEnd":
    case "streamError":
      // Configure overlay doesn't stream; ignore.
      return { overlay: packed(state), effects: [] };
    case "commit":
      if (state.step === "commit") return commitConfig(state);
      return { overlay: packed(state), effects: [] };
    case "key":
      return reduceKey(state, event.event.name);
    case "paste":
      return reducePaste(state, event.text);
  }
}

function reducePaste(state: ConfigureAssistantState, text: string): ReduceResult {
  if (state.step !== "auth") {
    // Only the auth step accepts text input today.
    return { overlay: packed(state), effects: [] };
  }
  const local = isLocalProvider(state.selectedProvider!);
  const field = local ? "ollamaUrl" : "apiKey";
  const current = local ? (state.ollamaUrl ?? "") : (state.apiKey ?? "");
  // Strip control chars (including stray ESC from a malformed bracketed-paste
  // sequence) but keep spaces, tabs, and printable text. Newlines collapse to
  // a single space so multi-line clipboard contents don't blow up the field.
  const cleaned = keepPrintableInputChars(text.replace(/[\r\n]+/g, " "));
  return {
    overlay: packed({ ...state, [field]: current + cleaned, error: undefined }),
    effects: [],
  };
}

function reduceKey(state: ConfigureAssistantState, name: string): ReduceResult {
  if (name === "escape") return { overlay: null, effects: [{ kind: "close" }] };

  switch (state.step) {
    case "provider":
      return reduceProviderStep(state, name);
    case "auth":
      return reduceAuthStep(state, name);
    case "privacy":
      return reducePrivacyStep(state, name);
    case "commit":
      return commitConfig(state);
  }
}

function reduceProviderStep(state: ConfigureAssistantState, name: string): ReduceResult {
  if (/^[1-9]$/.test(name)) {
    const idx = Number(name) - 1;
    const entry = CONFIGURE_PROVIDERS[idx];
    if (entry) {
      return {
        overlay: packed({ ...state, selectedProvider: entry.slug, error: undefined }),
        effects: [],
      };
    }
    return { overlay: packed(state), effects: [] };
  }
  if (name === "return") {
    if (!state.selectedProvider) {
      return {
        overlay: packed({ ...state, error: "Pick a provider with 1-9 first." }),
        effects: [],
      };
    }
    return { overlay: packed({ ...state, step: "auth", error: undefined }), effects: [] };
  }
  return { overlay: packed(state), effects: [] };
}

function reduceAuthStep(state: ConfigureAssistantState, name: string): ReduceResult {
  const local = isLocalProvider(state.selectedProvider!);
  const field = local ? "ollamaUrl" : "apiKey";
  const current = local ? (state.ollamaUrl ?? "") : (state.apiKey ?? "");

  if (name === "return") {
    if (current.length === 0) {
      return {
        overlay: packed({
          ...state,
          error: local ? "Enter a URL." : "Paste your API key.",
        }),
        effects: [],
      };
    }
    // Local providers skip privacy step (no remote call, no notice needed)
    // and commit immediately.
    if (local) return commitConfig({ ...state, step: "commit", error: undefined });
    return { overlay: packed({ ...state, step: "privacy", error: undefined }), effects: [] };
  }
  if (name === "backspace") {
    return {
      overlay: packed({ ...state, [field]: current.slice(0, -1), error: undefined }),
      effects: [],
    };
  }
  // Single printable char.
  if (name.length === 1) {
    return {
      overlay: packed({ ...state, [field]: current + name, error: undefined }),
      effects: [],
    };
  }
  // OpenTUI emits "space" for the spacebar.
  if (name === "space") {
    return {
      overlay: packed({ ...state, [field]: `${current} `, error: undefined }),
      effects: [],
    };
  }
  return { overlay: packed(state), effects: [] };
}

function reducePrivacyStep(state: ConfigureAssistantState, name: string): ReduceResult {
  if (name === "y" || name === "Y" || name === "return") {
    return commitConfig({ ...state, privacyConfirmed: true, step: "commit" });
  }
  if (name === "n" || name === "N") {
    return { overlay: null, effects: [{ kind: "close" }] };
  }
  return { overlay: packed(state), effects: [] };
}
