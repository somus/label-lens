import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { queueRecords } from "../../src/store/queries.ts";
import { buildSmartPendingQuery } from "../../src/store/queues/smart-pending.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("smart-pending — weighted scoring", () => {
  test("learned weights multiply built-in Issue score magnitude", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    // Two clean Records (no predictions disagreement, high confidence, no
    // incoming issues) get one computed built-in Issue each.
    const SALARY_ISSUE_SCORE = 0.5;
    const RENT_ISSUE_SCORE = 0.9;
    const W_LOW = 3;
    const W_DUP = 0.25;
    // Expected weighted contributions:
    const EXPECTED_SALARY_SCORE = W_LOW * SALARY_ISSUE_SCORE; // 1.5
    const EXPECTED_RENT_SCORE = W_DUP * RENT_ISSUE_SCORE; //   0.225
    expect(EXPECTED_SALARY_SCORE).toBeGreaterThan(EXPECTED_RENT_SCORE);

    const salary = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Salary credit October'`,
    )[0]!;
    const rent = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Rent transfer to landlord'`,
    )[0]!;

    const now = new Date().toISOString();
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${salary.id}, 'low_confidence',  ${SALARY_ISSUE_SCORE}, 'labellens:computed', ${now}),
             (${rent.id},   'exact_duplicate', ${RENT_ISSUE_SCORE},   'labellens:computed', ${now})
    `);

    // Salary outranks Rent even though Rent has the higher raw Issue score —
    // learned weights flip the effective ordering.
    const rows = queueRecords(
      store.db,
      buildSmartPendingQuery({
        weights: { low_confidence: W_LOW, source_disagreement: 1, exact_duplicate: W_DUP },
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

    const SALARY_BUILTIN_SCORE = 0.1;
    const RENT_IMPORTED_SCORE = 0.5;
    const W_LOW = 3;
    // Built-in Issue takes the learned multiplier; imported is hard-pinned at 1.
    const EXPECTED_SALARY_SCORE = W_LOW * SALARY_BUILTIN_SCORE; // 0.3
    const EXPECTED_RENT_SCORE = 1 * RENT_IMPORTED_SCORE; //         0.5
    expect(EXPECTED_RENT_SCORE).toBeGreaterThan(EXPECTED_SALARY_SCORE);

    const salary = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Salary credit October'`,
    )[0]!;
    const rent = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Rent transfer to landlord'`,
    )[0]!;

    const now = new Date().toISOString();
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${salary.id}, 'low_confidence', ${SALARY_BUILTIN_SCORE}, 'labellens:computed', ${now}),
             (${rent.id},   'low_confidence', ${RENT_IMPORTED_SCORE},  'cleanlab',           ${now})
    `);

    const rows = queueRecords(
      store.db,
      buildSmartPendingQuery({
        weights: { low_confidence: W_LOW, source_disagreement: 1, exact_duplicate: 1 },
      }),
    );

    const salaryIdx = rows.findIndex((r) => r.id === salary.id);
    const rentIdx = rows.findIndex((r) => r.id === rent.id);
    expect(rentIdx).toBeGreaterThanOrEqual(0);
    expect(salaryIdx).toBeGreaterThanOrEqual(0);
    expect(rentIdx).toBeLessThan(salaryIdx);
  });
});
