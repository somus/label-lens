import { and, eq, sql } from "drizzle-orm";
import {
  type AssistantResponseAny,
  isAssistantExtractionResponse,
  isAssistantMultiLabelResponse,
  isAssistantResponse,
} from "../assistant/schema.ts";
import type { Db } from "./db.ts";
import { assistantQueries } from "./schema.ts";

/**
 * Cache lookup keyed by (record_id, prompt_hash) per PRD §10.5. Returns the
 * stored response when present + schema-valid; returns null on miss, on
 * malformed JSON, or when the stored shape no longer matches the schema
 * (caller treats those identically and re-queries the provider).
 */
export function getCachedAssistantResponse(
  db: Db,
  recordId: string,
  promptHash: string,
): AssistantResponseAny | null {
  const rows = db
    .select({ responseJson: assistantQueries.responseJson })
    .from(assistantQueries)
    .where(
      and(eq(assistantQueries.recordId, recordId), eq(assistantQueries.promptHash, promptHash)),
    )
    .limit(1)
    .all();
  return parseStored(rows[0]?.responseJson);
}

/**
 * Lookup by record id alone, returning the most recent cached response
 * regardless of `prompt_hash`. Powers the on-focus auto-display path:
 * when a reviewer lands on a record that was previously queried, the
 * assistant strip can show the suggestion without a fresh network call
 * or knowledge of which prompt-template version produced it. Falls
 * back to `null` when no row exists OR the stored shape no longer
 * matches the schemas (caller treats both identically).
 */
export function getLatestCachedAssistantResponse(
  db: Db,
  recordId: string,
): AssistantResponseAny | null {
  const rows = db
    .select({ responseJson: assistantQueries.responseJson })
    .from(assistantQueries)
    .where(eq(assistantQueries.recordId, recordId))
    .orderBy(sql`${assistantQueries.createdAt} DESC`)
    .limit(1)
    .all();
  return parseStored(rows[0]?.responseJson);
}

function parseStored(json: string | undefined | null): AssistantResponseAny | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (isAssistantResponse(parsed)) return parsed;
  if (isAssistantMultiLabelResponse(parsed)) return parsed;
  if (isAssistantExtractionResponse(parsed)) return parsed;
  return null;
}

/**
 * Upsert by (record_id, prompt_hash). Idempotent: replaying the same key
 * replaces the row in place so the cache never grows unbounded for hot
 * records. `createdAt` advances on every write (used by future eviction).
 */
export function cacheAssistantResponse(
  db: Db,
  recordId: string,
  promptHash: string,
  response: AssistantResponseAny,
): void {
  const now = new Date().toISOString();
  const payload = JSON.stringify(response);
  // The composite index on (record_id, prompt_hash) isn't a unique constraint,
  // so we can't use onConflictDoUpdate — DELETE+INSERT inside a transaction
  // keeps the two statements atomic against concurrent writers.
  db.transaction((tx) => {
    tx.run(
      sql`DELETE FROM assistant_queries WHERE record_id = ${recordId} AND prompt_hash = ${promptHash}`,
    );
    tx.insert(assistantQueries)
      .values({
        recordId,
        promptHash,
        responseJson: payload,
        createdAt: now,
      })
      .run();
  });
}
