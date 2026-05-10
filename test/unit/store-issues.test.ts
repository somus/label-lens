import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
  COMPUTED_SIGNAL_SOURCE,
  insertComputedIssues,
  issuesForRecord,
  purgeComputedIssues,
  safeIssueSource,
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

describe("safeIssueSource (pure)", () => {
  test("passes through ordinary user sources", () => {
    expect(safeIssueSource("cleanlab")).toBe("cleanlab");
    expect(safeIssueSource("llm:gpt-4")).toBe("llm:gpt-4");
    expect(safeIssueSource(null)).toBeNull();
    expect(safeIssueSource(undefined)).toBeNull();
  });

  test("rewrites the reserved sentinel so user data can't be purged", () => {
    expect(safeIssueSource(COMPUTED_SIGNAL_SOURCE)).toBe(`imported:${COMPUTED_SIGNAL_SOURCE}`);
  });
});

describe("safeIssueSource (sentinel collision defense)", () => {
  test("rewrites imported sources that collide with the computed sentinel", async () => {
    using store = await openTmpStore();
    // Hand-roll a record + an imported issue whose source is the sentinel.
    const recordId = "rec-collision";
    store.db.run(
      sql`INSERT INTO records (id, source_path, row_index, text, raw)
          VALUES (${recordId}, 'inline', 0, 'hello', '{}')`,
    );
    insertComputedIssues(store.db, [{ recordId, type: "low_confidence", score: 0.5 }]);
    // Simulate an imported issue carrying the sentinel string before our
    // ingest defense runs (or coming from a future hand-edit).
    store.db.run(
      sql`INSERT INTO issues (record_id, type, score, source, created_at)
          VALUES (${recordId}, 'label_issue', 0.9, ${`imported:${COMPUTED_SIGNAL_SOURCE}`}, ${new Date().toISOString()})`,
    );

    purgeComputedIssues(store.db);

    const remaining = issuesForRecord(store.db, recordId);
    expect(remaining.length).toBe(1);
    expect(remaining[0]?.type).toBe("label_issue");
    expect(remaining[0]?.source).toBe(`imported:${COMPUTED_SIGNAL_SOURCE}`);
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
