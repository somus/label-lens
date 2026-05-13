import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { suggestedNext } from "../../src/store/stats.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

describe("suggestedNext", () => {
  test("picks by-source queue with the highest pending * relabel-rate * issues-factor", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);

    // 4 relabeled reviews on llm:gpt-4 records (ids 0..3).
    // → llm:gpt-4: reviewed=4, relabeled=4, rate=1.0.
    // → llm:gpt-4 pending = 4 (ids 4,5,6,7).
    for (const i of [0, 1, 2, 3]) {
      insertReview(store.db, {
        record_id: ids[i]!,
        status: "relabeled",
        final_label: "travel",
        prev_label: "food",
        source_of_truth: "human",
      });
    }

    // by-source:llm:gpt-4 → score = 4 * 1.0 * (1 + 0) = 4.0
    // pending / low-confidence → 6 * 0.5 * 1 = 3.0
    // flagged → 1 * 0.5 * 1.5 = 0.75
    // by-source:rule.entry_boundary → 1 * 0.5 * 1 = 0.5
    const rows = suggestedNext(store.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      kind: "suggested-next",
      queueId: "by-source:llm:gpt-4",
      score: 4,
    });
  });

  test("emits all-caught-up when every record has an effective review", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    for (const id of ids) {
      insertReview(store.db, {
        record_id: id,
        status: "accepted",
        final_label: "food",
        prev_label: null,
        source_of_truth: "human",
      });
    }
    expect(suggestedNext(store.db)).toEqual([{ kind: "all-caught-up" }]);
  });

  test("skipped records do not keep a queue alive", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);
    for (const id of ids) {
      insertReview(store.db, {
        record_id: id,
        status: "skipped",
        final_label: null,
        prev_label: null,
        source_of_truth: "human",
      });
    }
    expect(suggestedNext(store.db)).toEqual([{ kind: "all-caught-up" }]);
  });
});
