import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

const DISAGREEMENTS = resolveQueue("disagreements").query;

describe("disagreements queue", () => {
  test("includes records whose predictions disagree on label", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const rows = queueRecords(store.db, DISAGREEMENTS);
    // tiny.jsonl line 7: "Coffee at Blue Tokai" — predictions food + shopping.
    expect(rows.find((r) => r.text === "Coffee at Blue Tokai")).toBeDefined();
  });

  test("excludes records with a single prediction", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const rows = queueRecords(store.db, DISAGREEMENTS);
    expect(rows.find((r) => r.text === "Lunch at Zomato Bangalore")).toBeUndefined();
  });

  test("excludes records with an effective review", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Coffee at Blue Tokai'`,
    )[0]?.id;
    expect(id).toBeDefined();
    insertReview(store.db, {
      record_id: id!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    const rows = queueRecords(store.db, DISAGREEMENTS);
    expect(rows.find((r) => r.id === id)).toBeUndefined();
  });
});
