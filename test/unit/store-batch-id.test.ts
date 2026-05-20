import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openTmpStore } from "../util/tmp.ts";

type ColRow = { name: string; type: string; notnull: number; pk: number };

describe("reviews.batch_id column + effective_reviews projection", () => {
  test("reviews has nullable batch_id column", async () => {
    using store = await openTmpStore();
    const cols = store.db.all<ColRow>(sql`PRAGMA table_info(reviews)`);
    const byName = new Map(cols.map((c) => [c.name, c]));
    expect(byName.has("batch_id")).toBe(true);
    expect(byName.get("batch_id")?.notnull).toBe(0);
  });

  test("effective_reviews surfaces batch_id from underlying review row", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordRows = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`);
    const recordId = recordRows[0]!.id;
    const now = new Date().toISOString();
    const batchId = "batch-abc-123";

    store.db.run(sql`
      INSERT INTO reviews
        (record_id, status, final_label, prev_label, reviewed_at, source_of_truth, compensates_review_id, batch_id)
      VALUES
        (${recordId}, 'accepted', 'food', NULL, ${now}, 'human', NULL, ${batchId})
    `);

    const eff = store.db.all<{ record_id: string; batch_id: string | null }>(
      sql`SELECT record_id, batch_id FROM effective_reviews WHERE record_id = ${recordId}`,
    );
    expect(eff.length).toBe(1);
    expect(eff[0]?.batch_id).toBe(batchId);
  });

  test("effective_reviews returns NULL batch_id for non-batch single review", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordRows = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`);
    const recordId = recordRows[0]!.id;
    const now = new Date().toISOString();

    store.db.run(sql`
      INSERT INTO reviews
        (record_id, status, final_label, prev_label, reviewed_at, source_of_truth, compensates_review_id, batch_id)
      VALUES
        (${recordId}, 'accepted', 'food', NULL, ${now}, 'human', NULL, NULL)
    `);

    const eff = store.db.all<{ batch_id: string | null }>(
      sql`SELECT batch_id FROM effective_reviews WHERE record_id = ${recordId}`,
    );
    expect(eff.length).toBe(1);
    expect(eff[0]?.batch_id).toBeNull();
  });
});
