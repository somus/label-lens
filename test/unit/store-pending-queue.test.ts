import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { insertUndoEntry, queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

const PENDING = resolveQueue("pending").query;

describe("pending queue under undo semantics", () => {
  test("reviewed record is excluded from pending", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    expect(queueRecords(store.db, PENDING).find((r) => r.id === id)).toBeUndefined();
  });

  test("undone review re-includes record in pending", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertUndoEntry(store.db, id);
    const pending = queueRecords(store.db, PENDING);
    expect(pending.find((r) => r.id === id)).toBeDefined();
    expect(pending.length).toBe(10);
  });

  test("skipped record stays excluded (ADR 0003)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "skipped",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });
    expect(queueRecords(store.db, PENDING).find((r) => r.id === id)).toBeUndefined();
  });
});
