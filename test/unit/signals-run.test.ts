import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { runSignals } from "../../src/signals/run.ts";
import { COMPUTED_SIGNAL_SOURCE } from "../../src/store/issues.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { openTmpStore } from "../util/tmp.ts";

const T_HALF: import("../../src/signals/threshold.ts").LowConfidenceThresholds = {
  default: 0.5,
  bySource: [],
};

describe("runSignals (sync orchestrator)", () => {
  test("populates flagged + by-issue:* queues from tiny.jsonl", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    const before = queueRecords(store.db, resolveQueue("flagged").query).length;
    // Imported `label_issue` already populates flagged for line 10.
    expect(before).toBeGreaterThanOrEqual(1);

    const result = runSignals(store.db, { lowConfidence: T_HALF });
    expect(result.cancelled).toBe(false);
    expect(result.written).toBeGreaterThan(0);

    // Primary-only evaluation: low-conf records are line 4 (0.41) and line 8 (0.22).
    // Line 7 "Coffee at Blue Tokai" has primary `food` at 0.81 → not low-confidence;
    // its secondary 0.45 prediction is ignored.
    const lowConf = queueRecords(store.db, resolveQueue("by-issue:low_confidence").query);
    const lowConfTexts = new Set(lowConf.map((r) => r.text));
    expect(lowConfTexts.has("Netflix monthly")).toBe(true);
    expect(lowConfTexts.has("ATM withdrawal")).toBe(true);
    expect(lowConfTexts.has("Coffee at Blue Tokai")).toBe(false);

    // Multi-source disagreement on line 7 (food vs shopping).
    const disagree = queueRecords(store.db, resolveQueue("by-issue:source_disagreement").query);
    expect(disagree.map((r) => r.text)).toContain("Coffee at Blue Tokai");

    // tiny.jsonl has no exact duplicates → empty cluster queue.
    const dups = queueRecords(store.db, resolveQueue("by-issue:exact_duplicate").query);
    expect(dups.length).toBe(0);
  });

  test("exact_duplicate flags every member of a cluster (normalize-equal text)", async () => {
    using store = await openTmpStore({ ingest: "duplicates.jsonl" });
    runSignals(store.db, { lowConfidence: T_HALF });

    const dups = queueRecords(store.db, resolveQueue("by-issue:exact_duplicate").query);
    const texts = dups.map((r) => r.text).sort();
    // 3 records normalize to "recurring rent payment"; the unique row excluded.
    expect(dups.length).toBe(3);
    expect(texts).not.toContain("Unique row, no duplicate");

    const score = store.db.all<{ score: number }>(
      sql`SELECT score FROM issues WHERE type = 'exact_duplicate' LIMIT 1`,
    )[0]!.score;
    expect(score).toBeCloseTo(3 / 4, 10);
  });

  test("isCancelled hook short-circuits before any write", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const importedBefore = store.db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM issues WHERE source IS NULL OR source != ${COMPUTED_SIGNAL_SOURCE}`,
    )[0]!.n;

    const result = runSignals(store.db, { isCancelled: () => true });
    expect(result.cancelled).toBe(true);
    expect(result.written).toBe(0);

    const computed = store.db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM issues WHERE source = ${COMPUTED_SIGNAL_SOURCE}`,
    )[0]!.n;
    expect(computed).toBe(0);

    const imported = store.db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM issues WHERE source IS NULL OR source != ${COMPUTED_SIGNAL_SOURCE}`,
    )[0]!.n;
    expect(imported).toBe(importedBefore);
  });

  test("per-source override raises threshold for matching primary source", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    // ENTRY_START on line 10 has primary source `rule.entry_boundary` and
    // primary confidence 0.71. Default 0.5 → not low-confidence. An override
    // lifting `rule.*` to 0.9 should pull it in.
    runSignals(store.db, {
      lowConfidence: { default: 0.5, bySource: [{ pattern: "rule.*", threshold: 0.9 }] },
    });
    const lowConf = queueRecords(store.db, resolveQueue("by-issue:low_confidence").query);
    expect(lowConf.map((r) => r.text)).toContain("Senior Engineer at Acme");
  });

  test("issue severity is the normalized gap (threshold - confidence) / threshold", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    runSignals(store.db, { lowConfidence: T_HALF });
    // Netflix monthly: primary confidence 0.41, default threshold 0.5
    // → gap = (0.5 - 0.41) / 0.5 = 0.18
    const row = store.db.all<{ score: number; text: string }>(
      sql`SELECT i.score AS score, r.text AS text
          FROM issues i JOIN records r ON r.id = i.record_id
          WHERE i.type = 'low_confidence' AND r.text = 'Netflix monthly'`,
    )[0];
    expect(row).toBeDefined();
    expect(row!.score).toBeCloseTo((0.5 - 0.41) / 0.5, 10);
  });

  test("records with null primary confidence never produce a low_confidence issue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    // Line 9 "Refund from Swiggy" has no confidence → primaryConfidence is null.
    runSignals(store.db, { lowConfidence: T_HALF });
    const lowConf = queueRecords(store.db, resolveQueue("by-issue:low_confidence").query);
    expect(lowConf.map((r) => r.text)).not.toContain("Refund from Swiggy");
  });

  test("re-running purges prior computed rows but preserves imported issues", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    runSignals(store.db, { lowConfidence: T_HALF });
    const firstCount = store.db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM issues WHERE source = ${COMPUTED_SIGNAL_SOURCE}`,
    )[0]!.n;
    expect(firstCount).toBeGreaterThan(0);

    runSignals(store.db, { lowConfidence: T_HALF });
    const secondCount = store.db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM issues WHERE source = ${COMPUTED_SIGNAL_SOURCE}`,
    )[0]!.n;
    expect(secondCount).toBe(firstCount);

    // Imported label_issue from tiny.jsonl line 10 still present.
    const imported = store.db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM issues WHERE type = 'label_issue'`,
    )[0]!.n;
    expect(imported).toBe(1);
  });
});
