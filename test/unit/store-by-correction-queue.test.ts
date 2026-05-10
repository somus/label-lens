import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { insertUndoEntry, queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("by-correction queue factory", () => {
  test("returns records whose latest effective review flipped <from>:<to>", async () => {
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
    const def = resolveQueue("by-correction:food:travel");
    expect(def.label).toBe("Correction: food → travel");
    const rows = queueRecords(store.db, def.query);
    expect(rows.find((r) => r.id === id)).toBeDefined();
  });

  test("ignores other correction pairs", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    expect(queueRecords(store.db, resolveQueue("by-correction:food:rent").query).length).toBe(0);
  });

  test("undone correction disappears from the queue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    expect(queueRecords(store.db, resolveQueue("by-correction:food:travel").query).length).toBe(1);
    insertUndoEntry(store.db, id);
    expect(queueRecords(store.db, resolveQueue("by-correction:food:travel").query).length).toBe(0);
  });

  test("rejects malformed by-correction id", async () => {
    expect(() => resolveQueue("by-correction:food")).toThrow();
  });
});
