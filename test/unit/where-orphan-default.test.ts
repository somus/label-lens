import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
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
});
