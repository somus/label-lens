import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { AssistantResponse } from "../../src/assistant/schema.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import {
  cacheAssistantResponse,
  getCachedAssistantResponse,
} from "../../src/store/assistant-queries.ts";
import { DEFAULT_FIELDS, fixturePath, openTmpStore } from "../util/tmp.ts";

const sampleResponse: AssistantResponse = {
  suggestedLabel: "food",
  confidence: "high",
  reasoning: "Mentions a cafe meal.",
  evidenceFor: ["lunch", "cafe"],
  evidenceAgainst: [],
  recommendedAction: "accept",
};

async function withRecord<T>(
  fn: (db: import("../../src/store/db.ts").Db, recordId: string) => T | Promise<T>,
): Promise<T> {
  using store = await openTmpStore({ ingest: "tiny.jsonl" });
  // grab any record id from the ingest
  const row = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!;
  return await fn(store.db, row.id);
}

describe("getCachedAssistantResponse", () => {
  test("returns null on cache miss", async () => {
    await withRecord((db, id) => {
      expect(getCachedAssistantResponse(db, id, "no-such-hash")).toBeNull();
    });
  });
});

describe("cacheAssistantResponse", () => {
  test("inserts then lookup returns the same response", async () => {
    await withRecord((db, id) => {
      cacheAssistantResponse(db, id, "h1", sampleResponse);
      expect(getCachedAssistantResponse(db, id, "h1")).toEqual(sampleResponse);
    });
  });

  test("upsert idempotent: re-cache same key keeps row count at 1", async () => {
    await withRecord((db, id) => {
      cacheAssistantResponse(db, id, "h2", sampleResponse);
      cacheAssistantResponse(db, id, "h2", { ...sampleResponse, confidence: "low" });
      const rows = db.all<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM assistant_queries WHERE record_id = ${id} AND prompt_hash = 'h2'`,
      );
      expect(rows[0]?.n).toBe(1);
      const cur = getCachedAssistantResponse(db, id, "h2");
      expect(cur?.confidence).toBe("low");
    });
  });

  test("malformed cached JSON returns null instead of throwing", async () => {
    await withRecord((db, id) => {
      db.run(
        sql`INSERT INTO assistant_queries (record_id, prompt_hash, response_json, created_at) VALUES (${id}, 'bad', 'not-json', '2026-01-01T00:00:00Z')`,
      );
      expect(getCachedAssistantResponse(db, id, "bad")).toBeNull();
    });
  });

  test("response with schema-mismatched cached payload returns null", async () => {
    await withRecord((db, id) => {
      db.run(
        sql`INSERT INTO assistant_queries (record_id, prompt_hash, response_json, created_at) VALUES (${id}, 'shape', '{"foo":"bar"}', '2026-01-01T00:00:00Z')`,
      );
      expect(getCachedAssistantResponse(db, id, "shape")).toBeNull();
    });
  });
});

// Avoid unused-import lint
void ingestFile;
void DEFAULT_FIELDS;
void fixturePath;
