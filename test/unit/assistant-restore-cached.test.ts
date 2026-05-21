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
