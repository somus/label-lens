import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { runSignals } from "../../src/signals/run.ts";
import { COMPUTED_SIGNAL_SOURCE } from "../../src/store/issues.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("runSignals (sync orchestrator)", () => {
  test("populates flagged + by-issue:* queues from tiny.jsonl", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    const before = queueRecords(store.db, resolveQueue("flagged").query).length;
    // Imported `label_issue` already populates flagged for line 10.
    expect(before).toBeGreaterThanOrEqual(1);

    const result = runSignals(store.db, { lowConfidenceThreshold: 0.5 });
    expect(result.cancelled).toBe(false);
    expect(result.written).toBeGreaterThan(0);

    // tiny.jsonl: low-conf records are line 4 (0.41), line 8 (0.22), and the
    // multi-source line 7 has a 0.45 prediction.
    const lowConf = queueRecords(store.db, resolveQueue("by-issue:low_confidence").query);
    const lowConfTexts = new Set(lowConf.map((r) => r.text));
    expect(lowConfTexts.has("Netflix monthly")).toBe(true);
    expect(lowConfTexts.has("ATM withdrawal")).toBe(true);
    expect(lowConfTexts.has("Coffee at Blue Tokai")).toBe(true);

    // Multi-source disagreement on line 7 (food vs shopping).
    const disagree = queueRecords(store.db, resolveQueue("by-issue:source_disagreement").query);
    expect(disagree.map((r) => r.text)).toContain("Coffee at Blue Tokai");

    // tiny.jsonl has no exact duplicates → empty cluster queue.
    const dups = queueRecords(store.db, resolveQueue("by-issue:exact_duplicate").query);
    expect(dups.length).toBe(0);
  });

  test("exact_duplicate flags every member of a cluster (normalize-equal text)", async () => {
    using store = await openTmpStore({ ingest: "duplicates.jsonl" });
    runSignals(store.db, { lowConfidenceThreshold: 0.5 });

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

  test("re-running purges prior computed rows but preserves imported issues", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    runSignals(store.db, { lowConfidenceThreshold: 0.5 });
    const firstCount = store.db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM issues WHERE source = ${COMPUTED_SIGNAL_SOURCE}`,
    )[0]!.n;
    expect(firstCount).toBeGreaterThan(0);

    runSignals(store.db, { lowConfidenceThreshold: 0.5 });
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
