import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openTmpStore } from "../util/tmp.ts";

type ColRow = { name: string; type: string; notnull: number; pk: number };

describe("store schema (slice 2 additions)", () => {
  test("record_tags table exists with expected columns", async () => {
    using store = await openTmpStore();
    const cols = store.db.all<ColRow>(sql`PRAGMA table_info(record_tags)`);
    const byName = new Map(cols.map((c) => [c.name, c]));

    expect(byName.has("record_id")).toBe(true);
    expect(byName.has("tag")).toBe(true);
    expect(byName.has("created_at")).toBe(true);
    expect(byName.get("record_id")?.pk).toBe(1);
    expect(byName.get("tag")?.pk).toBe(2);
  });

  test("reviews has compensates_review_id column", async () => {
    using store = await openTmpStore();
    const cols = store.db.all<ColRow>(sql`PRAGMA table_info(reviews)`);
    const byName = new Map(cols.map((c) => [c.name, c]));
    expect(byName.has("compensates_review_id")).toBe(true);
    expect(byName.get("compensates_review_id")?.notnull).toBe(0);
  });

  test("reviews status accepts 'undone'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const recordRows = store.db.all<{ id: string }>(sql`SELECT id FROM records LIMIT 1`);
    const recordId = recordRows[0]!.id;
    const now = new Date().toISOString();

    store.db.run(sql`
      INSERT INTO reviews (record_id, status, final_label, prev_label, reviewed_at, source_of_truth, compensates_review_id)
      VALUES (${recordId}, 'accepted', 'food', NULL, ${now}, 'human', NULL)
    `);
    const accepted = store.db.all<{ id: number }>(
      sql`SELECT id FROM reviews WHERE record_id = ${recordId} AND status = 'accepted'`,
    );
    const acceptedId = accepted[0]!.id;

    store.db.run(sql`
      INSERT INTO reviews (record_id, status, final_label, prev_label, reviewed_at, source_of_truth, compensates_review_id)
      VALUES (${recordId}, 'undone', NULL, NULL, ${now}, 'human', ${acceptedId})
    `);

    const undone = store.db.all<{ status: string; compensates_review_id: number | null }>(
      sql`SELECT status, compensates_review_id FROM reviews WHERE status = 'undone'`,
    );
    expect(undone.length).toBe(1);
    expect(undone[0]?.compensates_review_id).toBe(acceptedId);
  });
});
