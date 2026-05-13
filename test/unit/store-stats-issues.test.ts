import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { insertComputedIssues } from "../../src/store/issues.ts";
import { issues } from "../../src/store/schema.ts";
import { importedIssues } from "../../src/store/stats.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("importedIssues", () => {
  test("groups by issue type; excludes labellens:computed source", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = store.db
      .all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`)
      .map((r) => r.id);

    // Imported (e.g. from JSONL `issues[]`): a row already exists from
    // tiny.jsonl record 10 (`label_issue`). Add two more imports.
    store.db
      .insert(issues)
      .values({
        recordId: ids[0]!,
        type: "label_issue",
        score: null,
        source: "external",
        createdAt: new Date().toISOString(),
      })
      .run();
    store.db
      .insert(issues)
      .values({
        recordId: ids[1]!,
        type: "policy_violation",
        score: null,
        source: "external",
        createdAt: new Date().toISOString(),
      })
      .run();

    // Computed signals must be filtered out.
    insertComputedIssues(store.db, [
      { recordId: ids[2]!, type: "low_confidence", score: 0.9 },
      { recordId: ids[3]!, type: "low_confidence", score: 0.8 },
    ]);

    expect(importedIssues(store.db)).toEqual([
      { kind: "imported-issue", issueType: "label_issue", count: 2 },
      { kind: "imported-issue", issueType: "policy_violation", count: 1 },
    ]);
  });

  test("counts distinct records (no double-count on duplicate-typed rows)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = store.db
      .all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`)
      .map((r) => r.id);
    const now = new Date().toISOString();
    store.db
      .insert(issues)
      .values([
        {
          recordId: ids[0]!,
          type: "label_issue",
          score: null,
          source: "external",
          createdAt: now,
        },
        {
          recordId: ids[0]!,
          type: "label_issue",
          score: null,
          source: "external",
          createdAt: now,
        },
      ])
      .run();

    expect(importedIssues(store.db)).toEqual([
      { kind: "imported-issue", issueType: "label_issue", count: 2 },
    ]);
  });

  test("no imported issues returns empty", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    // tiny.jsonl record 10 carries `label_issue` import; purge it for this case.
    store.db.run(sql`DELETE FROM issues`);
    expect(importedIssues(store.db)).toEqual([]);
  });
});
