import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { openTmpStore } from "../util/tmp.ts";

const FLAGGED = resolveQueue("flagged").query;

describe("flagged queue", () => {
  test("empty when issues table has no rows for tiny.jsonl predictions", async () => {
    using store = await openTmpStore();
    expect(queueRecords(store.db, FLAGGED).length).toBe(0);
  });

  test("tiny.jsonl ingest surfaces label_issue record (5% imported issues path)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const rows = queueRecords(store.db, FLAGGED);
    expect(rows.length).toBe(1);
    expect(rows[0]?.text).toBe("Senior Engineer at Acme");
  });

  test("manual issue insert flips a record into the queue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Lunch at Zomato Bangalore'`,
    )[0]!.id;
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${id}, 'source_disagreement', 0.71, 'signals', ${new Date().toISOString()})
    `);
    const rows = queueRecords(store.db, FLAGGED);
    expect(rows.find((r) => r.id === id)).toBeDefined();
  });
});
