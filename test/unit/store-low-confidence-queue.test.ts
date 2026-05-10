import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

const LOW_CONF = resolveQueue("low-confidence").query;

describe("low-confidence queue", () => {
  test("orders unreviewed records by primary confidence ascending", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const rows = queueRecords(store.db, LOW_CONF);
    const confs = rows.map((r) => r.primaryPrediction?.confidence ?? null);
    // Tail of NULLs after the numeric ascending head.
    let lastNumeric = -Infinity;
    let inNullTail = false;
    for (const c of confs) {
      if (c === null) {
        inNullTail = true;
      } else {
        expect(inNullTail).toBe(false);
        expect(c).toBeGreaterThanOrEqual(lastNumeric);
        lastNumeric = c;
      }
    }
    // tiny.jsonl seeds the lowest numeric confidence at "ATM withdrawal" (0.22).
    expect(rows[0]?.text).toBe("ATM withdrawal");
  });

  test("excludes records with an effective review", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const lowestId = store.db.all<{ id: string }>(
      sql`SELECT id FROM records_with_primary ORDER BY primary_confidence ASC LIMIT 1`,
    )[0]?.id;
    expect(lowestId).toBeDefined();
    insertReview(store.db, {
      record_id: lowestId!,
      status: "accepted",
      final_label: "other",
      prev_label: null,
      source_of_truth: "human",
    });
    const rows = queueRecords(store.db, LOW_CONF);
    expect(rows.find((r) => r.id === lowestId)).toBeUndefined();
  });
});
