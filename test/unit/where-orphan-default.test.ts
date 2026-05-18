import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("where: DSL orphan default", () => {
  test("excludes orphan rows by default", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const before = queueRecords(store.db, resolveQueue("where:source = 'llm:gpt-4'").query);
    expect(before.length).toBeGreaterThan(1);
    const orphanId = before[0]!.id;
    store.db.run(sql`UPDATE records SET orphan = 1 WHERE id = ${orphanId}`);

    const rows = queueRecords(store.db, resolveQueue("where:source = 'llm:gpt-4'").query);
    expect(rows.find((r) => r.id === orphanId)).toBeUndefined();
    expect(rows.length).toBe(before.length - 1);
  });

  test("include-orphans: prefix surfaces orphans", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const before = queueRecords(store.db, resolveQueue("where:source = 'llm:gpt-4'").query);
    const orphanId = before[0]!.id;
    store.db.run(sql`UPDATE records SET orphan = 1 WHERE id = ${orphanId}`);

    const rows = queueRecords(
      store.db,
      resolveQueue("where:include-orphans: source = 'llm:gpt-4'").query,
    );
    expect(rows.find((r) => r.id === orphanId)).toBeDefined();
    expect(rows.length).toBe(before.length);
  });

  test("include-orphans: tolerates surrounding whitespace", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const before = queueRecords(store.db, resolveQueue("where:source = 'llm:gpt-4'").query);
    const orphanId = before[0]!.id;
    store.db.run(sql`UPDATE records SET orphan = 1 WHERE id = ${orphanId}`);

    const rows = queueRecords(
      store.db,
      resolveQueue("where:   include-orphans:   source = 'llm:gpt-4'").query,
    );
    expect(rows.length).toBe(before.length);
  });

  test("include-orphans inside the expression is a parse error", () => {
    expect(() => resolveQueue("where:source = 'llm:gpt-4' and include-orphans:")).toThrow();
  });

  test("where:orphan = 1 is a dead letter without the prefix", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    store.db.run(sql`UPDATE records SET orphan = 1 WHERE id = ${id}`);

    const rows = queueRecords(store.db, resolveQueue("where:orphan = 1").query);
    expect(rows).toHaveLength(0);
  });

  test("include-orphans: composes with nested AND/OR", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const all = store.db.all<{ id: string }>(sql`SELECT id FROM records`);
    const orphanId = all[0]!.id;
    const acceptedId = all[1]!.id;
    store.db.run(sql`UPDATE records SET orphan = 1 WHERE id = ${orphanId}`);
    insertReview(store.db, {
      record_id: acceptedId,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });

    const rows = queueRecords(
      store.db,
      resolveQueue("where:include-orphans: (orphan = 1 or status = 'accepted')").query,
    );
    const found = new Set(rows.map((r) => r.id));
    expect(found.has(orphanId)).toBe(true);
    expect(found.has(acceptedId)).toBe(true);
  });
});
