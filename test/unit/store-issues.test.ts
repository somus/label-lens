import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
  COMPUTED_SIGNAL_SOURCE,
  insertComputedIssues,
  issuesForRecord,
  purgeComputedIssues,
} from "../../src/store/issues.ts";
import { openTmpStore } from "../util/tmp.ts";

function firstRecordId(db: import("../../src/store/db.ts").Db): string {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index LIMIT 1`)[0]!.id;
}

describe("insertComputedIssues", () => {
  test("writes rows with source = computed and exposes them via issuesForRecord", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = firstRecordId(store.db);

    insertComputedIssues(store.db, [
      { recordId, type: "low_confidence", score: 0.7 },
      { recordId, type: "source_disagreement", score: 0.5 },
    ]);

    const rows = issuesForRecord(store.db, recordId);
    const computed = rows.filter((r) => r.source === COMPUTED_SIGNAL_SOURCE);
    expect(computed.map((r) => r.type).sort()).toEqual(["low_confidence", "source_disagreement"]);
    expect(computed.find((r) => r.type === "low_confidence")?.score).toBeCloseTo(0.7, 10);
    expect(computed.every((r) => typeof r.createdAt === "string" && r.createdAt.length > 0)).toBe(
      true,
    );
  });

  test("no-op for an empty array", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    expect(() => insertComputedIssues(store.db, [])).not.toThrow();
  });
});

describe("purgeComputedIssues", () => {
  test("deletes computed rows but preserves imported ones", async () => {
    // tiny.jsonl line 10 has imported issues: [{type: "label_issue", score: 0.6}] (source NULL).
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordId = firstRecordId(store.db);
    const importedRecordId = store.db.all<{ id: string }>(
      sql`SELECT record_id AS id FROM issues WHERE source IS NULL OR source != ${COMPUTED_SIGNAL_SOURCE} LIMIT 1`,
    )[0]!.id;

    insertComputedIssues(store.db, [
      { recordId, type: "low_confidence", score: 0.7 },
      { recordId: importedRecordId, type: "exact_duplicate", score: 0.001 },
    ]);

    const beforeCount = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM issues`)[0]!.n;
    expect(beforeCount).toBeGreaterThanOrEqual(3);

    purgeComputedIssues(store.db);

    const remaining = store.db
      .all<{ source: string | null }>(sql`SELECT source FROM issues`)
      .map((r) => r.source);
    expect(remaining.every((s) => s !== COMPUTED_SIGNAL_SOURCE)).toBe(true);
    expect(remaining.length).toBeGreaterThanOrEqual(1);
    expect(
      issuesForRecord(store.db, importedRecordId).find((i) => i.type === "label_issue"),
    ).toBeDefined();
  });
});
