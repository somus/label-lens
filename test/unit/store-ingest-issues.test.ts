import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openTmpStore } from "../util/tmp.ts";

type IssueRow = {
  record_id: string;
  type: string;
  score: number | null;
  source: string | null;
};

describe("ingest issues[]", () => {
  test("tiny.jsonl 'label_issue' lands in issues table", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const rows = store.db.all<IssueRow>(sql`SELECT record_id, type, score, source FROM issues`);
    expect(rows.length).toBe(1);
    expect(rows[0]?.type).toBe("label_issue");
    expect(rows[0]?.score).toBe(0.6);

    const recordText = store.db.all<{ text: string }>(
      sql`SELECT text FROM records WHERE id = ${rows[0]?.record_id}`,
    )[0]?.text;
    expect(recordText).toBe("Senior Engineer at Acme");
  });

  test("ingest with no issues[] yields no issue rows", async () => {
    using store = await openTmpStore();
    const count = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM issues`)[0]?.n;
    expect(count).toBe(0);
  });
});
