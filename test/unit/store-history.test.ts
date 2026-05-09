import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { insertUndoEntry, recentReviews } from "../../src/store/queries.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("recentReviews", () => {
  test("returns most recent reviews newest first", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = store.db
      .all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index LIMIT 3`)
      .map((r) => r.id);
    insertReview(store.db, {
      record_id: ids[0]!,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      note: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[1]!,
      status: "relabeled",
      final_label: "travel",
      prev_label: "food",
      note: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: ids[2]!,
      status: "rejected",
      final_label: null,
      prev_label: "food",
      note: null,
      source_of_truth: "human",
    });

    const history = recentReviews(store.db, 5);
    expect(history.length).toBe(3);
    expect(history[0]?.record_id).toBe(ids[2]!);
    expect(history[0]?.status).toBe("rejected");
    expect(history[1]?.status).toBe("relabeled");
    expect(history[2]?.status).toBe("accepted");
  });

  test("limit caps the result", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ids = store.db
      .all<{ id: string }>(sql`SELECT id FROM records ORDER BY row_index LIMIT 6`)
      .map((r) => r.id);
    for (const id of ids) {
      insertReview(store.db, {
        record_id: id,
        status: "accepted",
        final_label: "food",
        prev_label: null,
        note: null,
        source_of_truth: "human",
      });
    }
    expect(recentReviews(store.db, 5).length).toBe(5);
    expect(recentReviews(store.db, 4).length).toBe(4);
  });

  test("excludes undone and compensated reviews", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const id = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`)[0]!.id;
    insertReview(store.db, {
      record_id: id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      note: null,
      source_of_truth: "human",
    });
    insertUndoEntry(store.db, id);
    expect(recentReviews(store.db, 5).length).toBe(0);
  });
});
