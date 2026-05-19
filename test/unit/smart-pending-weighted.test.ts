import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { buildSmartPendingQuery } from "../../src/store/queues/smart-pending.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("smart-pending — weighted scoring", () => {
  test("learned weights multiply built-in Issue score magnitude", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    // Pick two clean Records (no predictions disagreement, high confidence,
    // no incoming issues) and attach one computed built-in Issue each.
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
             (${rent.id}, 'exact_duplicate', 0.9, 'labellens:computed', ${now})
    `);

    // With learned weights {low_confidence: 3, exact_duplicate: 0.25}:
    //   salary score = 3 × 0.5  = 1.50
    //   rent   score = 0.25 × 0.9 = 0.225
    // → salary must outrank rent even though rent has the higher raw Issue
    //   score.
    const rows = queueRecords(
      store.db,
      buildSmartPendingQuery({
        weights: { low_confidence: 3, source_disagreement: 1, exact_duplicate: 0.25 },
      }),
    );

    const salaryIdx = rows.findIndex((r) => r.id === salary.id);
    const rentIdx = rows.findIndex((r) => r.id === rent.id);
    expect(salaryIdx).toBeGreaterThanOrEqual(0);
    expect(rentIdx).toBeGreaterThanOrEqual(0);
    expect(salaryIdx).toBeLessThan(rentIdx);
  });

  test("imported Issues contribute at fixed weight 1.0 regardless of learned weights", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    // Record A: built-in `low_confidence` Issue at score 0.1, learned weight 3.
    //   contribution = 3 × 0.1 = 0.3
    // Record B: imported Issue typed `low_confidence` at score 0.5 from
    //   a non-sentinel source. Even with learned `low_confidence` weight = 3,
    //   the import must stay at fixed weight 1.0.
    //   contribution = 1 × 0.5 = 0.5
    // → Record B ranks above Record A.
    const salary = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Salary credit October'`,
    )[0]!;
    const rent = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Rent transfer to landlord'`,
    )[0]!;

    const now = new Date().toISOString();
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${salary.id}, 'low_confidence', 0.1, 'labellens:computed', ${now}),
             (${rent.id},   'low_confidence', 0.5, 'cleanlab',           ${now})
    `);

    const rows = queueRecords(
      store.db,
      buildSmartPendingQuery({
        weights: { low_confidence: 3, source_disagreement: 1, exact_duplicate: 1 },
      }),
    );

    const salaryIdx = rows.findIndex((r) => r.id === salary.id);
    const rentIdx = rows.findIndex((r) => r.id === rent.id);
    expect(rentIdx).toBeGreaterThanOrEqual(0);
    expect(salaryIdx).toBeGreaterThanOrEqual(0);
    expect(rentIdx).toBeLessThan(salaryIdx);
  });
});
