import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { toggleTag } from "../../src/store/tags.ts";
import { openTmpStore } from "../util/tmp.ts";

const MARKED = resolveQueue("marked").query;

describe("marked queue", () => {
  test("empty when no records are tagged 'marked'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    expect(queueRecords(store.db, MARKED).length).toBe(0);
  });

  test("includes records with the 'marked' tag", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = store.db
      .all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index LIMIT 2`)
      .map((r) => r.id);
    toggleTag(store.db, ids[0]!, "marked");
    toggleTag(store.db, ids[1]!, "marked");
    const rows = queueRecords(store.db, MARKED);
    expect(rows.map((r) => r.id).sort()).toEqual(ids.sort());
  });

  test("untagging removes a record from the queue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    toggleTag(store.db, id, "marked");
    expect(queueRecords(store.db, MARKED).length).toBe(1);
    toggleTag(store.db, id, "marked");
    expect(queueRecords(store.db, MARKED).length).toBe(0);
  });

  test("'marked' is additive — survives review state", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    toggleTag(store.db, id, "marked");
    store.db.run(sql`
      INSERT INTO reviews (record_id, status, final_label, prev_label, reviewed_at, source_of_truth)
      VALUES (${id}, 'accepted', 'food', NULL, ${new Date().toISOString()}, 'human')
    `);
    expect(queueRecords(store.db, MARKED).find((r) => r.id === id)).toBeDefined();
  });
});
