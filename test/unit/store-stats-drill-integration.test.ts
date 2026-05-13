import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../../src/store/db.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { issues } from "../../src/store/schema.ts";
import { allStats, drillToQueue } from "../../src/store/stats.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

/**
 * Lock in the contract that every drillable stat row produces a queue id
 * that (a) `resolveQueue` accepts and (b) `queueRecords` returns a non-empty
 * row set for — i.e. the stat's counter and the queue's filter never diverge.
 */
describe("drillToQueue contract: every stat row drills into a populated queue", () => {
  test("seeded mix of reviews + issues + reasons drills consistently across all kinds", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);

    // Reasons so relabel-by-reason fires.
    store.db.run(
      sql`UPDATE predictions SET reason = 'low_confidence' WHERE record_id = ${ids[0]!} AND source = 'llm:gpt-4'`,
    );
    store.db.run(
      sql`UPDATE predictions SET reason = 'low_confidence' WHERE record_id = ${ids[1]!} AND source = 'llm:gpt-4'`,
    );

    // Two relabels (same correction) + one accepted on llm:gpt-4.
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[1]!,
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[2]!,
      status: "accepted",
      final_label: "shopping",
      prev_label: "shopping",
      source_of_truth: "human",
    });

    // Extra imported issue so importedIssues has more than the fixture row.
    store.db
      .insert(issues)
      .values({
        recordId: ids[3]!,
        type: "label_issue",
        score: null,
        source: "external",
        createdAt: new Date().toISOString(),
      })
      .run();

    const { sections } = allStats(store.db);
    let drilled = 0;
    for (const section of sections) {
      for (const row of section.rows) {
        const queueId = drillToQueue(row);
        if (queueId === null) continue;
        drilled++;
        const def = resolveQueue(queueId);
        const records = queueRecords(store.db, def.query);
        expect(records.length).toBeGreaterThan(0);
      }
    }
    // Sanity: we exercised every drillable kind we expected to.
    expect(drilled).toBeGreaterThanOrEqual(6);
  });
});
