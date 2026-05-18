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
const LABEL_NAMES = ["food", "travel"];

let registration: FauxProviderRegistration;

beforeEach(() => {
  // Each test gets a fresh faux registration so queued responses don't leak.
  registration = registerFauxProvider({ provider: REMOTE_PROVIDER_NAME });
  // Provider now requires an apiKey (env-var fallback resolves to pi-ai's
  // canonical name); fauxes ignore the key but the gate still fires.
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterEach(() => {
  registration.unregister();
  delete process.env.ANTHROPIC_API_KEY;
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
      labelNames: LABEL_NAMES,
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
      labelNames: LABEL_NAMES,
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
      labelNames: LABEL_NAMES,
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
        labelNames: LABEL_NAMES,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AssistantQueryError);
      expect((err as AssistantQueryError).code).toBe("no-tool-call");
    }
  });

  test("suggestedLabel not in config.labels throws invalid-label and is not cached", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    const hallucinated: AssistantResponse = { ...validResponse, suggestedLabel: "totallyMadeUp" };
    queueSubmit(hallucinated);

    const promptInput = makePromptInput();
    try {
      await queryAssistant({
        db: store.db,
        recordId,
        assistant: ACK_REMOTE,
        localOnly: false,
        model: registration.getModel(),
        promptInput,
        labelNames: LABEL_NAMES,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AssistantQueryError);
      expect((err as AssistantQueryError).code).toBe("invalid-label");
    }
    const promptHash = hashPrompt(canonicalizePrompt(promptInput));
    expect(getCachedAssistantResponse(store.db, recordId, promptHash)).toBeNull();
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
        labelNames: LABEL_NAMES,
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
        labelNames: LABEL_NAMES,
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
        labelNames: LABEL_NAMES,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AssistantQueryError);
      expect((err as AssistantQueryError).code).toBe("local-only-violation");
    }
    expect(registration.state.callCount).toBe(0);
  });

  test("no env var set anywhere throws no-provider listing both candidates", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    const fakeVar = "LABELLENS_TEST_MISSING_KEY";
    delete process.env[fakeVar];
    // Clear the canonical fallback (set by beforeEach) so neither resolves.
    delete process.env.ANTHROPIC_API_KEY;
    queueSubmit(validResponse);
    try {
      await queryAssistant({
        db: store.db,
        recordId,
        assistant: {
          enabled: true,
          provider: REMOTE_PROVIDER_NAME,
          privacyAcknowledged: true,
          apiKeyEnvVar: fakeVar,
        },
        localOnly: false,
        model: registration.getModel(),
        promptInput: makePromptInput(),
        labelNames: LABEL_NAMES,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AssistantQueryError);
      expect((err as AssistantQueryError).code).toBe("no-provider");
      // Error message lists both candidates so the reviewer knows which to export.
      expect((err as AssistantQueryError).message).toContain(fakeVar);
      expect((err as AssistantQueryError).message).toContain("ANTHROPIC_API_KEY");
    }
    expect(registration.state.callCount).toBe(0);
  });

  test("apiKeyEnvVar empty but canonical pi-ai var set → falls back and succeeds", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    const staleVar = "LABELLENS_TEST_STALE_VAR";
    delete process.env[staleVar];
    // beforeEach already set ANTHROPIC_API_KEY = "test-key". Old wizard run's
    // apiKeyEnvVar=LABELLENS_TEST_STALE_VAR is empty, but pi-ai's canonical
    // ANTHROPIC_API_KEY resolves → call proceeds without forcing reconfigure.
    queueSubmit(validResponse);
    const result = await queryAssistant({
      db: store.db,
      recordId,
      assistant: {
        enabled: true,
        provider: REMOTE_PROVIDER_NAME,
        privacyAcknowledged: true,
        apiKeyEnvVar: staleVar,
      },
      localOnly: false,
      model: registration.getModel(),
      promptInput: makePromptInput(),
      labelNames: LABEL_NAMES,
    });
    expect(result.response).toEqual(validResponse);
  });

  test("apiKeyEnvVar populated → key passed to pi-ai (no 403 fallback path)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    const fakeVar = "LABELLENS_TEST_API_KEY";
    process.env[fakeVar] = "sk-fake";
    queueSubmit(validResponse);
    try {
      const result = await queryAssistant({
        db: store.db,
        recordId,
        assistant: {
          enabled: true,
          provider: REMOTE_PROVIDER_NAME,
          privacyAcknowledged: true,
          apiKeyEnvVar: fakeVar,
        },
        localOnly: false,
        model: registration.getModel(),
        promptInput: makePromptInput(),
        labelNames: LABEL_NAMES,
      });
      expect(result.response).toEqual(validResponse);
    } finally {
      delete process.env[fakeVar];
    }
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
      labelNames: LABEL_NAMES,
    });
    expect(result.response).toEqual(validResponse);
  });
});

describe("PROMPT_TEMPLATE_VERSION cache-bust", () => {
  test("bumping the version invalidates cache (rehash differs)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;

    const oldInput = makePromptInput({ prompt_template_version: PROMPT_TEMPLATE_VERSION });
    const newInput = makePromptInput({
      prompt_template_version: `${PROMPT_TEMPLATE_VERSION}-bumped`,
    });
    const oldHash = hashPrompt(canonicalizePrompt(oldInput));
    const newHash = hashPrompt(canonicalizePrompt(newInput));
    expect(oldHash).not.toBe(newHash);

    cacheAssistantResponse(store.db, recordId, oldHash, validResponse);
    // Lookup under the new hash → miss.
    expect(getCachedAssistantResponse(store.db, recordId, newHash)).toBeNull();
  });
});
