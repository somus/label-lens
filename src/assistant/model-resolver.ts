import { getModel, type Model } from "@earendil-works/pi-ai";
import type { AssistantConfig } from "../config/config.ts";

const DEFAULT_OLLAMA_URL = "http://localhost:11434/v1";

/**
 * Resolve a pi-ai `Model` from `config.assistant`. Built-in providers use
 * `getModel(provider, modelId)`; Ollama is a custom model pointed at a
 * local OpenAI-compatible endpoint. Throws if `provider` / `model` are
 * missing — caller branches into the configure overlay on that error.
 */
export function resolveAssistantModel(assistant: AssistantConfig): Model<string> {
  if (!assistant.provider) {
    throw new Error("assistant.provider not configured");
  }
  if (!assistant.model) {
    throw new Error("assistant.model not configured");
  }
  if (assistant.provider === "ollama") {
    // Fixed MVP assumptions: 128K context + 8K max tokens cover llama3.1 / 3.2
    // and most modern Ollama models out of the box. Configurable per-deployment
    // (or live-probed via `/api/show`) is a follow-up — track in a new issue
    // when a reviewer hits a model with a smaller window.
    const model: Model<"openai-completions"> = {
      id: assistant.model,
      name: `${assistant.model} (Ollama)`,
      api: "openai-completions",
      provider: "ollama",
      baseUrl: assistant.ollamaUrl ?? DEFAULT_OLLAMA_URL,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 8192,
    };
    return model as Model<string>;
  }
  // pi-ai's getModel is strictly typed against its `MODELS` registry.
  // Cast through unknown so config-driven provider/model strings flow without
  // dragging the entire model registry into our type tree.
  return getModel(
    assistant.provider as Parameters<typeof getModel>[0],
    assistant.model as never,
  ) as Model<string>;
}
