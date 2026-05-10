import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("by-issue queue factory", () => {
  test("empty when no matching issue rows exist", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    expect(queueRecords(store.db, resolveQueue("by-issue:source_disagreement").query).length).toBe(
      0,
    );
  });

  test("matches imported label_issue from tiny.jsonl", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const rows = queueRecords(store.db, resolveQueue("by-issue:label_issue").query);
    expect(rows.length).toBe(1);
    expect(rows[0]?.text).toBe("Senior Engineer at Acme");
  });

  test("does not match a different issue type", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${id}, 'outlier', 0.9, NULL, ${new Date().toISOString()})
    `);
    expect(queueRecords(store.db, resolveQueue("by-issue:source_disagreement").query).length).toBe(
      0,
    );
    expect(
      queueRecords(store.db, resolveQueue("by-issue:outlier").query).find((r) => r.id === id),
    ).toBeDefined();
  });
});
