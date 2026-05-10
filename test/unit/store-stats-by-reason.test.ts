import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../../src/store/db.ts";
import { insertReview } from "../../src/store/records.ts";
import { relabelByReason } from "../../src/store/stats.ts";
import { openTmpStore } from "../util/tmp.ts";

function recordIds(db: Db): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index`).map((r) => r.id);
}

describe("relabelByReason", () => {
  test("rate = relabeled / reviewed grouped by primary reason; sorted DESC", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = recordIds(store.db);

    const setReason = (recordId: string, reason: string) => {
      store.db.run(
        sql`UPDATE predictions SET reason = ${reason}
            WHERE record_id = ${recordId} AND source = 'llm:gpt-4'`,
      );
    };
    setReason(ids[0]!, "low_confidence");
    setReason(ids[1]!, "low_confidence");
    setReason(ids[2]!, "low_confidence");
    setReason(ids[3]!, "source_disagreement");
    setReason(ids[4]!, "source_disagreement");

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
      final_label: "food",
      prev_label: "travel",
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[2]!,
      status: "accepted",
      final_label: "shopping",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[3]!,
      status: "relabeled",
      final_label: "rent",
      prev_label: "utility",
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[4]!,
      status: "accepted",
      final_label: "salary",
      prev_label: null,
      source_of_truth: "human",
    });

    expect(relabelByReason(store.db)).toEqual([
      {
        kind: "relabel-by-reason",
        reason: "low_confidence",
        rate: 2 / 3,
        reviewed: 3,
      },
      {
        kind: "relabel-by-reason",
        reason: "source_disagreement",
        rate: 0.5,
        reviewed: 2,
      },
    ]);
  });

  test("records with no reason or no review are omitted", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    expect(relabelByReason(store.db)).toEqual([]);
  });
});
