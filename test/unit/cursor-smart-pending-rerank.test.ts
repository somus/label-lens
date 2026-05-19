import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openCursor } from "../../src/cursor/cursor.ts";
import { buildSmartPendingQuery } from "../../src/store/queues/smart-pending.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("smart-pending cursor — rerank preserves focus", () => {
  test("refresh picks up new weights without moving off the focused Record", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    // Two Records with competing built-in Issue scores so weight changes flip
    // their relative ranking.
    const salary = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Salary credit October'`,
    )[0]!;
    const rent = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Rent transfer to landlord'`,
    )[0]!;
    const now = new Date().toISOString();
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${salary.id}, 'low_confidence', 0.5, 'labellens:computed', ${now}),
             (${rent.id},   'exact_duplicate', 0.9, 'labellens:computed', ${now})
    `);

    // Mutable weight box read by the factory on every refresh — mirrors the
    // AppContext seam where weights come from `smartLearning.weights()`.
    const weights = {
      low_confidence: 3,
      source_disagreement: 1,
      exact_duplicate: 0.25,
    };
    const cursor = openCursor(store.db, "smart-pending", () => ({
      id: "smart-pending",
      label: "Pending (smart)",
      query: buildSmartPendingQuery({ weights }),
    }));

    // Initial ordering: Salary (1.5) > Rent (0.225). Focus Salary explicitly.
    expect(cursor.seek(salary.id)).toBe(true);
    expect(cursor.current()?.id).toBe(salary.id);
    const focusedBefore = cursor.current()?.id;

    // Flip weights so Rent's score (0.9 × 3 = 2.7) beats Salary (0.5 × 0.25 =
    // 0.125). Cursor.refresh() re-invokes the factory, queries with new
    // weights, then snaps back to the previously focused Record id.
    weights.low_confidence = 0.25;
    weights.exact_duplicate = 3;
    cursor.refresh();

    // Focus must NOT have jumped — the reviewer's current Record id is
    // preserved across the reorder, even though its rank dropped.
    expect(cursor.current()?.id).toBe(focusedBefore);
    // And the new top of the queue is now Rent, proving the factory really
    // re-ran with the updated weights.
    expect(cursor.window(10, 10).records[0]?.id).toBe(rent.id);
  });
});
