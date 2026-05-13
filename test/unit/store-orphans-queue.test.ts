import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { records } from "../../src/store/schema.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("orphans queue + built-in exclusion", () => {
  test("pending excludes records flagged orphan = 1", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(
      sql`SELECT id FROM records ORDER BY row_index LIMIT 1`,
    )[0]!.id;
    const pendingBefore = queueRecords(store.db, resolveQueue("pending").query);
    expect(pendingBefore.find((r) => r.id === id)).toBeDefined();

    store.db.update(records).set({ orphan: true }).where(eq(records.id, id)).run();

    const pendingAfter = queueRecords(store.db, resolveQueue("pending").query);
    expect(pendingAfter.find((r) => r.id === id)).toBeUndefined();
  });

  test("orphans queue lists exactly the orphan records", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(
      sql`SELECT id FROM records ORDER BY row_index LIMIT 1`,
    )[0]!.id;
    expect(queueRecords(store.db, resolveQueue("orphans").query)).toEqual([]);

    store.db.update(records).set({ orphan: true }).where(eq(records.id, id)).run();

    const orphans = queueRecords(store.db, resolveQueue("orphans").query);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]!.id).toBe(id);
  });
});
