import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";

const SMART = resolveQueue("smart-pending").query;

describe("smart-pending queue", () => {
  test("orders by composite signal score descending", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    // Locate ATM withdrawal (already low-conf 0.22) and pump it to score=3
    // by adding a second prediction (disagreement) + an issue (flagged).
    const atm = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'ATM withdrawal'`,
    )[0]!;
    store.db.run(sql`
      INSERT INTO predictions (record_id, label, confidence, source, raw)
      VALUES (${atm.id}, 'cash', 0.18, 'regex.simple', '{}')
    `);
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${atm.id}, 'low_confidence', 0.18, 'signals', ${new Date().toISOString()})
    `);

    const rows = queueRecords(store.db, SMART);

    // ATM withdrawal should be first (score=3).
    expect(rows[0]?.text).toBe("ATM withdrawal");

    // Compute per-row composite score and assert non-increasing order.
    const scores = rows.map((r) => {
      const conf = r.primaryPrediction?.confidence ?? null;
      const lowConf = conf !== null && conf < 0.4 ? 1 : 0;
      const disagreement =
        store.db.all<{ n: number }>(
          sql`SELECT COUNT(DISTINCT label) AS n FROM predictions WHERE record_id = ${r.id}`,
        )[0]!.n > 1
          ? 1
          : 0;
      const flagged =
        store.db.all<{ n: number }>(
          sql`SELECT COUNT(*) AS n FROM issues WHERE record_id = ${r.id}`,
        )[0]!.n > 0
          ? 1
          : 0;
      return lowConf + disagreement + flagged;
    });
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]!).toBeGreaterThanOrEqual(scores[i]!);
    }

    // Sanity: at least one record scored above zero.
    expect(scores[0]!).toBeGreaterThan(0);
    // And at least one scored zero (tail).
    expect(scores.at(-1)!).toBe(0);
  });

  test("excludes records with an effective review", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const target = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'ATM withdrawal'`,
    )[0]!;
    insertReview(store.db, {
      record_id: target.id,
      status: "accepted",
      final_label: "other",
      prev_label: null,
      source_of_truth: "human",
    });
    const rows = queueRecords(store.db, SMART);
    expect(rows.find((r) => r.id === target.id)).toBeUndefined();
  });

  test("excludes orphans", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const target = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Lunch at Zomato Bangalore'`,
    )[0]!;
    store.db.run(sql`UPDATE records SET orphan = 1 WHERE id = ${target.id}`);
    const rows = queueRecords(store.db, SMART);
    expect(rows.find((r) => r.id === target.id)).toBeUndefined();
  });

  test("within same score tier orders by confidence asc (null last) then rowIndex asc", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    // Among the score=0 tier in tiny.jsonl:
    //  - Lunch (0.92), Uber (0.88), Amazon (0.74), Netflix (0.41),
    //    Salary (0.99), Rent (0.96), Refund (null)
    // Lowest conf within tier first; nulls last.
    const rows = queueRecords(store.db, SMART);
    const tier0 = rows.filter((r) => {
      const conf = r.primaryPrediction?.confidence ?? null;
      const lowConf = conf !== null && conf < 0.4 ? 1 : 0;
      const dis =
        store.db.all<{ n: number }>(
          sql`SELECT COUNT(DISTINCT label) AS n FROM predictions WHERE record_id = ${r.id}`,
        )[0]!.n > 1
          ? 1
          : 0;
      const flg =
        store.db.all<{ n: number }>(
          sql`SELECT COUNT(*) AS n FROM issues WHERE record_id = ${r.id}`,
        )[0]!.n > 0
          ? 1
          : 0;
      return lowConf + dis + flg === 0;
    });
    expect(tier0[0]?.text).toBe("Netflix monthly");
    expect(tier0.at(-1)?.text).toBe("Refund from Swiggy");
  });
});
