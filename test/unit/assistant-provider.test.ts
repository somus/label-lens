import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type FauxProviderRegistration,
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  registerFauxProvider,
} from "@earendil-works/pi-ai";
import { sql } from "drizzle-orm";
import {
  buildPromptInput,
  type CanonicalPromptInput,
  canonicalizePrompt,
  hashPrompt,
} from "../../src/assistant/prompt.ts";
import { PROMPT_TEMPLATE_VERSION } from "../../src/assistant/prompt-template.ts";
import { AssistantQueryError, queryAssistant } from "../../src/assistant/provider.ts";
import type { AssistantResponse } from "../../src/assistant/schema.ts";
import type { AssistantConfig } from "../../src/config/config.ts";
import {
  cacheAssistantResponse,
  getCachedAssistantResponse,
} from "../../src/store/assistant-queries.ts";
import { openTmpStore } from "../util/tmp.ts";

const REMOTE_PROVIDER_NAME = "anthropic";
const OLLAMA_PROVIDER_NAME = "ollama";

let registration: FauxProviderRegistration;

beforeEach(() => {
  // Each test gets a fresh faux registration so queued responses don't leak.
  registration = registerFauxProvider({ provider: REMOTE_PROVIDER_NAME });
});

afterEach(() => {
  registration.unregister();
});

function makePromptInput(overrides: Partial<CanonicalPromptInput> = {}): CanonicalPromptInput {
  const base = buildPromptInput({
    record: {
      id: "rec-1",
      text: "lunch at the cafe",
      context_before: "yesterday",
      context_after: "tomorrow",
    },
    task: "classification",
    labels: [{ name: "food" }, { name: "travel" }],
    guidelines: "Pick the most fitting label.",
    predictions: [{ label: "food", source: "llm:gpt-4", confidence: 0.91 }],
    provider: REMOTE_PROVIDER_NAME,
    model: "faux",
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
  });
  return { ...base, ...overrides };
}

const validResponse: AssistantResponse = {
  suggestedLabel: "food",
  confidence: "high",
  reasoning: "Cafe + lunch = food.",
  evidenceFor: ["mentions lunch", "mentions cafe"],
  evidenceAgainst: [],
  recommendedAction: "accept",
};

function queueSubmit(args: AssistantResponse) {
  registration.setResponses([
    fauxAssistantMessage([fauxToolCall("submit_label_suggestion", args)], {
      stopReason: "toolUse",
    }),
  ]);
}

const ACK_REMOTE: AssistantConfig = {
  enabled: true,
  provider: REMOTE_PROVIDER_NAME,
  privacyAcknowledged: true,
};

describe("queryAssistant cache hit", () => {
  test("cache hit returns synchronously without invoking provider", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    const promptInput = makePromptInput();
    const promptHash = hashPrompt(canonicalizePrompt(promptInput));
    cacheAssistantResponse(store.db, recordId, promptHash, validResponse);

    // Queue nothing — if the provider is hit, faux throws "no responses queued".
    const result = await queryAssistant({
      db: store.db,
      recordId,
      assistant: ACK_REMOTE,
      localOnly: false,
      model: registration.getModel(),
      promptInput,
    });
    expect(result.wasCached).toBe(true);
    expect(result.response).toEqual(validResponse);
    expect(registration.state.callCount).toBe(0);
  });
});

describe("queryAssistant cache miss path", () => {
  test("valid response is returned and persisted", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    queueSubmit(validResponse);

    const promptInput = makePromptInput();
    const result = await queryAssistant({
      db: store.db,
      recordId,
      assistant: ACK_REMOTE,
      localOnly: false,
      model: registration.getModel(),
      promptInput,
    });

    expect(result.wasCached).toBe(false);
    expect(result.response).toEqual(validResponse);
    const promptHash = hashPrompt(canonicalizePrompt(promptInput));
    expect(getCachedAssistantResponse(store.db, recordId, promptHash)).toEqual(validResponse);
  });

  test("text deltas drive onToken callback", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    registration.setResponses([
      fauxAssistantMessage(
        [fauxText("Thinking..."), fauxToolCall("submit_label_suggestion", validResponse)],
        { stopReason: "toolUse" },
      ),
    ]);

    const tokens: string[] = [];
    await queryAssistant({
      db: store.db,
      recordId,
      assistant: ACK_REMOTE,
      localOnly: false,
      model: registration.getModel(),
      promptInput: makePromptInput(),
      onToken: (t) => tokens.push(t),
    });
    expect(tokens.join("")).toContain("Thinking");
  });

  test("missing tool call throws no-tool-call", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    registration.setResponses([
      fauxAssistantMessage([fauxText("Just rambling, no tool call.")], { stopReason: "stop" }),
    ]);
    try {
      await queryAssistant({
        db: store.db,
        recordId,
        assistant: ACK_REMOTE,
        localOnly: false,
        model: registration.getModel(),
        promptInput: makePromptInput(),
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AssistantQueryError);
      expect((err as AssistantQueryError).code).toBe("no-tool-call");
    }
  });

  test("malformed tool args throws schema-mismatch", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    registration.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("submit_label_suggestion", { suggestedLabel: "food" } as never)],
        { stopReason: "toolUse" },
      ),
    ]);
    try {
      await queryAssistant({
        db: store.db,
        recordId,
        assistant: ACK_REMOTE,
        localOnly: false,
        model: registration.getModel(),
        promptInput: makePromptInput(),
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AssistantQueryError);
      expect((err as AssistantQueryError).code).toBe("schema-mismatch");
    }
  });
});

describe("queryAssistant privacy + --local-only gates", () => {
  test("privacy not acknowledged + remote provider throws privacy-gate", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    queueSubmit(validResponse);
    let gateFired = false;
    try {
      await queryAssistant({
        db: store.db,
        recordId,
        assistant: { enabled: true, provider: REMOTE_PROVIDER_NAME },
        localOnly: false,
        model: registration.getModel(),
        promptInput: makePromptInput(),
        onPrivacyGate: () => {
          gateFired = true;
        },
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AssistantQueryError);
      expect((err as AssistantQueryError).code).toBe("privacy-gate");
    }
    expect(gateFired).toBe(true);
    // Provider must not have been invoked.
    expect(registration.state.callCount).toBe(0);
  });

  test("--local-only + remote provider throws local-only-violation", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    queueSubmit(validResponse);
    try {
      await queryAssistant({
        db: store.db,
        recordId,
        assistant: ACK_REMOTE,
        localOnly: true,
        model: registration.getModel(),
        promptInput: makePromptInput(),
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AssistantQueryError);
      expect((err as AssistantQueryError).code).toBe("local-only-violation");
    }
    expect(registration.state.callCount).toBe(0);
  });

  test("--local-only + ollama provider passes through to model call", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    // Re-register with ollama provider name so it routes correctly.
    registration.unregister();
    registration = registerFauxProvider({ provider: OLLAMA_PROVIDER_NAME });
    queueSubmit(validResponse);

    const result = await queryAssistant({
      db: store.db,
      recordId,
      assistant: { enabled: true, provider: OLLAMA_PROVIDER_NAME, privacyAcknowledged: false },
      localOnly: true,
      model: registration.getModel(),
      promptInput: makePromptInput({ provider: OLLAMA_PROVIDER_NAME }),
    });
    expect(result.response).toEqual(validResponse);
  });
});

describe("PROMPT_TEMPLATE_VERSION cache-bust", () => {
  test("bumping the version invalidates cache (rehash differs)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;

    const oldInput = makePromptInput({ prompt_template_version: "1.0.0" });
    const newInput = makePromptInput({ prompt_template_version: "1.1.0" });
    const oldHash = hashPrompt(canonicalizePrompt(oldInput));
    const newHash = hashPrompt(canonicalizePrompt(newInput));
    expect(oldHash).not.toBe(newHash);

    cacheAssistantResponse(store.db, recordId, oldHash, validResponse);
    // Lookup under the new hash → miss.
    expect(getCachedAssistantResponse(store.db, recordId, newHash)).toBeNull();
  });
});
