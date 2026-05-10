import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("by-label queue factory", () => {
  test("matches records via primary prediction label when no review exists", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const def = resolveQueue("by-label:food");
    const rows = queueRecords(store.db, def.query);
    // tiny.jsonl: "Lunch at Zomato" + "Coffee at Blue Tokai" + "Refund from Swiggy" all predict food.
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.find((r) => r.text === "Lunch at Zomato Bangalore")).toBeDefined();
  });

  test("matches by effective review label after relabel", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Uber ride to airport'`,
    )[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "relabeled",
      final_label: "food",
      prev_label: "travel",
      source_of_truth: "human",
    });
    const rows = queueRecords(store.db, resolveQueue("by-label:food").query);
    expect(rows.find((r) => r.id === id)).toBeDefined();
  });

  test("review label takes precedence over prediction label", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Lunch at Zomato Bangalore'`,
    )[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    expect(
      queueRecords(store.db, resolveQueue("by-label:food").query).find((r) => r.id === id),
    ).toBeUndefined();
    expect(
      queueRecords(store.db, resolveQueue("by-label:travel").query).find((r) => r.id === id),
    ).toBeDefined();
  });
});
