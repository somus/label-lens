import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { WhereParseError } from "../../src/store/where-parser.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("where: parser SQL injection guards", () => {
  test("classic injection attempt parses as a single string literal and runs safely", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const before = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records`)[0]!.n;
    expect(before).toBeGreaterThan(0);

    let parseErr: unknown = null;
    let rows: unknown[] = [];
    try {
      const def = resolveQueue("where:source = 'foo''; DROP TABLE records; --'");
      rows = queueRecords(store.db, def.query);
    } catch (err) {
      parseErr = err;
    }

    if (parseErr) {
      // Acceptable: the literal can't be parsed cleanly, so we never run it.
      expect(parseErr).toBeInstanceOf(WhereParseError);
    } else {
      // The whole bracketed string is one bound parameter — zero matches expected.
      expect(rows.length).toBe(0);
    }

    const after = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records`)[0]!.n;
    expect(after).toBe(before);
    const stillThere = store.db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'records'`,
    );
    expect(stillThere.length).toBe(1);
  });

  test("trailing semicolons are rejected (no statement chaining)", () => {
    expect(() => resolveQueue("where:source = 'llm:gpt-4'; DROP TABLE records")).toThrow(
      WhereParseError,
    );
  });

  test("backslash-escaped quotes inside string literal are honored", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const def = resolveQueue("where:source = 'has\\'quote'");
    expect(def.id).toBe("where:source = 'has\\'quote'");
    const rows = queueRecords(store.db, def.query);
    expect(rows.length).toBe(0);
  });
});
