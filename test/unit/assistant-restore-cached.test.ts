import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { restoreCachedAssistantState } from "../../src/assistant/restore-cached.ts";
import type { AssistantExtractionResponse, AssistantResponse } from "../../src/assistant/schema.ts";
import type { ExtractionField, LabellensConfig } from "../../src/config/config.ts";
import {
  cacheAssistantResponse,
  getLatestCachedAssistantResponse,
} from "../../src/store/assistant-queries.ts";
import type { RecordWithPrimaryPrediction } from "../../src/types.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const EXTRACTION_FIELDS: ExtractionField[] = [
  { name: "company", type: "string", required: true },
  { name: "amount", type: "string", required: false },
];

const classificationConfig: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

const extractionConfig: LabellensConfig = {
  task: "extraction",
  labels: [],
  extraction: { fields: EXTRACTION_FIELDS },
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
} as unknown as LabellensConfig;

function record(id: string, label: string | null): RecordWithPrimaryPrediction {
  return {
    id,
    text: "x",
    context_before: null,
    context_after: null,
    document_id: null,
    primary_label: label,
    primary_source: "src",
    primary_confidence: 0.9,
    raw: "{}",
    marked: false,
    skipped: false,
    note: null,
    primaryPrediction:
      label === null
        ? null
        : {
            id: 1,
            record_id: id,
            label,
            confidence: 0.9,
            source: "src",
            reason: null,
            raw: "{}",
          },
  } as unknown as RecordWithPrimaryPrediction;
}

describe("restoreCachedAssistantState", () => {
  test("returns null when no cached row exists for the record", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    const got = restoreCachedAssistantState(store.db, classificationConfig, record(id, "food"));
    expect(got).toBeNull();
  });

  test("rebuilds a single-label done state from the latest cached row", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    const response: AssistantResponse = {
      suggestedLabel: "travel",
      confidence: "high",
      reasoning: "obvious",
      evidenceFor: [],
      evidenceAgainst: [],
      recommendedAction: "relabel",
    };
    cacheAssistantResponse(store.db, id, "h1", response);
    const got = restoreCachedAssistantState(store.db, classificationConfig, record(id, "food"));
    expect(got).not.toBeNull();
    if (got?.status === "done") {
      expect(got.suggestion).toBe("travel");
      expect(got.recordId).toBe(id);
      expect(got.recommendedAction).toBe("relabel");
    }
  });

  test("rebuilds an extraction done state and reattaches field context", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    const response: AssistantExtractionResponse = {
      extractedObject: { company: "Acme", amount: "100" },
      confidence: "high",
      reasoning: "explicit",
      evidenceFor: [],
      evidenceAgainst: [],
      recommendedAction: "accept",
    };
    cacheAssistantResponse(store.db, id, "h1", response);
    const got = restoreCachedAssistantState(
      store.db,
      extractionConfig,
      record(id, '{"company":"Acme","amount":"100"}'),
    );
    expect(got).not.toBeNull();
    if (got?.status === "done") {
      expect(got.suggestionObject).toEqual({ company: "Acme", amount: "100" });
      expect(got.extraction?.fields).toHaveLength(2);
      expect(got.extraction?.predictedObject).toEqual({ company: "Acme", amount: "100" });
    }
  });

  test("rejects when cached shape mismatches the configured task", async () => {
    // Cache holds an extraction response but the live config is classification.
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    cacheAssistantResponse(store.db, id, "h1", {
      extractedObject: { company: "Acme" },
      confidence: "high",
      reasoning: "",
      evidenceFor: [],
      evidenceAgainst: [],
      recommendedAction: "accept",
    });
    const got = restoreCachedAssistantState(store.db, classificationConfig, record(id, "food"));
    expect(got).toBeNull();
  });

  test("hydrateAssistantFromCache installs the cached state into app.overlay so Enter is interactive", async () => {
    // The render path used to synthesise the strip state at frame time
    // without installing it as `app.overlay`. Enter on the strip then
    // dispatched through the review scope (where Enter is unbound) and
    // no-op'd. The hydrate hook now installs the cached state into the
    // overlay slot on cursor change so the assistant reducer receives
    // key events normally.
    const { createAppContext, enterReview } = await import("../../src/app/context.ts");
    const { defaultDisplay } = await import("../../src/render/capability.ts");
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    const response: AssistantResponse = {
      suggestedLabel: "travel",
      confidence: "high",
      reasoning: "ride to airport",
      evidenceFor: [],
      evidenceAgainst: [],
      recommendedAction: "relabel",
    };
    cacheAssistantResponse(store.db, id, "h1", response);
    const app = createAppContext({
      db: store.db,
      config: {
        ...classificationConfig,
        assistant: {
          enabled: true,
          provider: "ollama",
          model: "llama3",
          privacyAcknowledged: true,
        },
      },
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    enterReview(app, "pending");
    app.hydrateAssistantFromCache();
    expect(app.overlay?.kind).toBe("assistant");
    if (app.overlay?.kind === "assistant" && app.overlay.state.status === "done") {
      expect(app.overlay.state.recordId).toBe(id);
      expect(app.overlay.state.suggestion).toBe("travel");
    }
  });

  test("hydrateAssistantFromCache does NOT clobber an active non-assistant overlay", async () => {
    const { createAppContext, enterReview } = await import("../../src/app/context.ts");
    const { defaultDisplay } = await import("../../src/render/capability.ts");
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    cacheAssistantResponse(store.db, id, "h1", {
      suggestedLabel: "food",
      confidence: "high",
      reasoning: "",
      evidenceFor: [],
      evidenceAgainst: [],
      recommendedAction: "accept",
    });
    const app = createAppContext({
      db: store.db,
      config: {
        ...classificationConfig,
        assistant: {
          enabled: true,
          provider: "ollama",
          model: "llama3",
          privacyAcknowledged: true,
        },
      },
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    enterReview(app, "pending");
    // Simulate the reviewer mid-task in a different modal.
    app.overlay = { kind: "note" } as unknown as NonNullable<typeof app.overlay>;
    app.hydrateAssistantFromCache();
    expect(app.overlay?.kind).toBe("note");
  });

  test("getLatestCachedAssistantResponse returns the most recent row regardless of prompt hash", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    const older: AssistantResponse = {
      suggestedLabel: "food",
      confidence: "low",
      reasoning: "old",
      evidenceFor: [],
      evidenceAgainst: [],
      recommendedAction: "accept",
    };
    const newer: AssistantResponse = { ...older, suggestedLabel: "travel", reasoning: "new" };
    cacheAssistantResponse(store.db, id, "older-hash", older);
    // small delay so createdAt timestamps differ
    await new Promise((resolve) => setTimeout(resolve, 5));
    cacheAssistantResponse(store.db, id, "newer-hash", newer);
    const got = getLatestCachedAssistantResponse(store.db, id);
    expect(got).not.toBeNull();
    if (got && "suggestedLabel" in got) {
      expect(got.suggestedLabel).toBe("travel");
    }
  });
});
