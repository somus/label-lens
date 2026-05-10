import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("by-reason queue factory", () => {
  test("filters by primary prediction reason", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    store.db.run(sql`UPDATE predictions SET reason = 'low_confidence' WHERE record_id = ${id}`);
    const def = resolveQueue("by-reason:low_confidence");
    const rows = queueRecords(store.db, def.query);
    expect(rows.find((r) => r.id === id)).toBeDefined();
    for (const r of rows) {
      expect(r.primaryPrediction?.reason).toBe("low_confidence");
    }
  });

  test("returns empty for an unknown reason", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    expect(queueRecords(store.db, resolveQueue("by-reason:unknown").query).length).toBe(0);
  });
});
