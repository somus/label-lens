import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { insertUndoEntry, queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

const SKIPPED = resolveQueue("skipped").query;

describe("skipped queue", () => {
  test("includes records whose latest effective review is 'skipped'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "skipped",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });
    const skipped = queueRecords(store.db, SKIPPED);
    expect(skipped.find((r) => r.id === id)).toBeDefined();
    expect(skipped.length).toBe(1);
  });

  test("excludes accepted records", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    expect(queueRecords(store.db, SKIPPED).length).toBe(0);
  });

  test("excludes records whose latest effective review supersedes a skip", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "skipped",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    expect(queueRecords(store.db, SKIPPED).length).toBe(0);
  });

  test("undone skip removes record from skipped queue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "skipped",
      final_label: null,
      prev_label: null,
      source_of_truth: "human",
    });
    expect(queueRecords(store.db, SKIPPED).length).toBe(1);
    insertUndoEntry(store.db, id);
    expect(queueRecords(store.db, SKIPPED).length).toBe(0);
  });
});
