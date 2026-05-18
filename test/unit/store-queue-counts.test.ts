import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { nonOrphanRecordCount, queueCount } from "../../src/store/queues/queue-counts.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("queueCount", () => {
  test("matches queueRecords length for every static built-in", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    for (const id of [
      "pending",
      "skipped",
      "low-confidence",
      "disagreements",
      "flagged",
      "marked",
    ]) {
      const def = resolveQueue(id);
      expect(queueCount(store.db, def)).toBe(queueRecords(store.db, def.query).length);
    }
  });

  test("matches for parameterized factories", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    for (const id of ["by-source:llm:gpt-4", "by-label:food", "by-issue:label_issue"]) {
      const def = resolveQueue(id);
      expect(queueCount(store.db, def)).toBe(queueRecords(store.db, def.query).length);
    }
  });
});

describe("nonOrphanRecordCount", () => {
  test("excludes orphan rows", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const total = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records`)[0]!.n;
    expect(total).toBeGreaterThan(2);

    const ids = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 2`).map((r) => r.id);
    store.db.run(sql`UPDATE records SET orphan = 1 WHERE id IN (${ids[0]}, ${ids[1]})`);

    expect(nonOrphanRecordCount(store.db)).toBe(total - 2);
  });

  test("returns full count when no orphans", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const total = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records`)[0]!.n;
    expect(nonOrphanRecordCount(store.db)).toBe(total);
  });
});
