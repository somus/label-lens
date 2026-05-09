import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../../src/store/db.ts";
import { queueRecords, recordById } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

const PENDING = resolveQueue("pending").query;

function totalRecords(db: Db): number {
  const rows = db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records`);
  return rows[0]?.n ?? 0;
}

describe("store + ingest", () => {
  test("ingests tiny.jsonl into records + predictions", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    expect(totalRecords(store.db)).toBe(10);

    const pending = queueRecords(store.db, PENDING);
    expect(pending.length).toBe(10);
    expect(pending[0]?.text).toBe("Lunch at Zomato Bangalore");
    expect(pending[0]?.primaryPrediction?.label).toBe("food");
  });

  test("primary prediction picks highest confidence", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const coffee = queueRecords(store.db, PENDING).find((r) => r.text.startsWith("Coffee"));
    expect(coffee?.primaryPrediction?.label).toBe("food");
    expect(coffee?.primaryPrediction?.confidence).toBeCloseTo(0.81);
  });

  test("accept moves record out of pending queue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const first = queueRecords(store.db, PENDING)[0]!;
    insertReview(store.db, {
      record_id: first.id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const after = queueRecords(store.db, PENDING);
    expect(after.length).toBe(9);
    expect(after.find((r) => r.id === first.id)).toBeUndefined();
  });

  test("recordById returns the hydrated record", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const first = queueRecords(store.db, PENDING)[0]!;
    const fetched = recordById(store.db, first.id);
    expect(fetched?.text).toBe(first.text);
    expect(fetched?.primaryPrediction?.label).toBe(first.primaryPrediction?.label);
    expect(recordById(store.db, "does-not-exist")).toBeNull();
  });
});
