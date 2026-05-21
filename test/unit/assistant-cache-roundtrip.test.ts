import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type {
  AssistantExtractionResponse,
  AssistantMultiLabelResponse,
  AssistantResponse,
} from "../../src/assistant/schema.ts";
import {
  cacheAssistantResponse,
  getCachedAssistantResponse,
} from "../../src/store/assistant-queries.ts";
import { openTmpStore } from "../util/tmp.ts";

const HASH = "deadbeef";

async function seed() {
  // FK from assistant_queries.record_id → records.id requires a real row;
  // ingest the tiny fixture so the table has one to point at.
  const store = await openTmpStore({ ingest: "tiny.jsonl" });
  const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
  return { store, id };
}

describe("assistant cache roundtrip", () => {
  test("single-label response: write then read returns the same object", async () => {
    const { store, id } = await seed();
    using _ = store;
    const response: AssistantResponse = {
      suggestedLabel: "food",
      confidence: "high",
      reasoning: "obvious",
      evidenceFor: [],
      evidenceAgainst: [],
      recommendedAction: "accept",
    };
    cacheAssistantResponse(store.db, id, HASH, response);
    expect(getCachedAssistantResponse(store.db, id, HASH)).toEqual(response);
  });

  test("multi-label response: write then read returns the same object", async () => {
    const { store, id } = await seed();
    using _ = store;
    const response: AssistantMultiLabelResponse = {
      suggestedLabels: ["spam", "toxicity"],
      confidence: "medium",
      reasoning: "",
      evidenceFor: [],
      evidenceAgainst: [],
      recommendedAction: "relabel",
    };
    cacheAssistantResponse(store.db, id, HASH, response);
    expect(getCachedAssistantResponse(store.db, id, HASH)).toEqual(response);
  });

  test("extraction response: write then read returns the same object (regression)", async () => {
    // Without isAssistantExtractionResponse in the read-side guard the
    // cached row was rejected on lookup, forcing a re-query of the
    // provider on every overlay re-open for the same record.
    const { store, id } = await seed();
    using _ = store;
    const response: AssistantExtractionResponse = {
      extractedObject: { company: "Acme", amount: "100", date: null },
      confidence: "high",
      reasoning: "explicit in text",
      evidenceFor: [],
      evidenceAgainst: [],
      recommendedAction: "accept",
    };
    cacheAssistantResponse(store.db, id, HASH, response);
    expect(getCachedAssistantResponse(store.db, id, HASH)).toEqual(response);
  });

  test("non-matching (record_id, prompt_hash) miss returns null", async () => {
    const { store, id } = await seed();
    using _ = store;
    expect(getCachedAssistantResponse(store.db, id, HASH)).toBeNull();
  });
});
