import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openTmpStore } from "../util/tmp.ts";

describe("assistant_queries migration", () => {
  test("table queryable after migrations apply", async () => {
    using store = await openTmpStore();
    const rows = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM assistant_queries`);
    expect(rows[0]?.n).toBe(0);
  });

  test("composite index on (record_id, prompt_hash) exists", async () => {
    using store = await openTmpStore();
    const idx = store.db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'assistant_queries'`,
    );
    const names = idx.map((r) => r.name);
    expect(names).toContain("idx_assistant_queries_record_hash");
    expect(names).toContain("idx_assistant_queries_created");
  });
});
