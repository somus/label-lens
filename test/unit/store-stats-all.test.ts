import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { allStats } from "../../src/store/stats.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

describe("allStats", () => {
  test("emits sections in PRD §10.8 order; empty sections are omitted", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    store.db.run(
      sql`UPDATE predictions SET reason = 'low_confidence' WHERE record_id = ${ids[0]!}`,
    );
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });

    const { sections } = allStats(store.db);
    const labels = sections.map((s) => s.label);
    expect(labels).toEqual([
      "Progress",
      "Decisions",
      "Acceptance by source",
      "Relabel by source",
      "Relabel by reason",
      "Top corrections",
      "Labels with highest correction rate",
      "Weakest sources",
      "Imported issues",
      "Suggested next queue",
    ]);
  });

  test("with no data, omits aggregation sections but keeps progress/decisions/suggested-next", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    store.db.run(sql`DELETE FROM issues`); // strip the fixture's seeded imported issue
    const { sections } = allStats(store.db);
    const labels = sections.map((s) => s.label);
    expect(labels).toEqual(["Progress", "Decisions", "Suggested next queue"]);
    const suggested = sections.find((s) => s.label === "Suggested next queue")!;
    expect(suggested.rows[0]!.kind).toBe("suggested-next");
  });

  test("imported issues section preserved when issue rows exist", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    // tiny.jsonl record 10 already has an imported `label_issue`.
    const { sections } = allStats(store.db);
    expect(sections.find((s) => s.label === "Imported issues")).toBeDefined();
  });
});
