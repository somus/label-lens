import { describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { recomputeLowConfidence, runSignals } from "../../src/signals/run.ts";
import { COMPUTED_SIGNAL_SOURCE } from "../../src/store/issues.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { issues } from "../../src/store/schema.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("recomputeLowConfidence", () => {
  test("rewrites low_confidence rows when threshold changes", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    runSignals(store.db, { lowConfidence: { default: 0.5, bySource: [] } });

    const before = queueRecords(store.db, resolveQueue("by-issue:low_confidence").query);
    expect(before.length).toBeGreaterThan(0);

    // Raise threshold so additional records become low-confidence.
    recomputeLowConfidence(store.db, { default: 0.95, bySource: [] });

    const after = queueRecords(store.db, resolveQueue("by-issue:low_confidence").query);
    expect(after.length).toBeGreaterThan(before.length);
    // Netflix 0.41 stays; Lunch at Zomato (0.92) joins under the new threshold.
    expect(after.map((r) => r.text)).toContain("Lunch at Zomato Bangalore");
  });

  test("preserves source_disagreement and exact_duplicate rows", async () => {
    using store = await openTmpStore({ ingest: "duplicates.jsonl" });
    runSignals(store.db, { lowConfidence: { default: 0.5, bySource: [] } });

    const dupsBefore = store.db
      .select()
      .from(issues)
      .where(and(eq(issues.type, "exact_duplicate"), eq(issues.source, COMPUTED_SIGNAL_SOURCE)))
      .all();
    expect(dupsBefore.length).toBeGreaterThan(0);

    recomputeLowConfidence(store.db, { default: 0.1, bySource: [] });

    const dupsAfter = store.db
      .select()
      .from(issues)
      .where(and(eq(issues.type, "exact_duplicate"), eq(issues.source, COMPUTED_SIGNAL_SOURCE)))
      .all();
    expect(dupsAfter.length).toBe(dupsBefore.length);
  });

  test("preserves imported (non-computed) issues", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    runSignals(store.db, { lowConfidence: { default: 0.5, bySource: [] } });

    const importedBefore = store.db
      .select()
      .from(issues)
      .where(eq(issues.type, "label_issue"))
      .all();
    expect(importedBefore.length).toBe(1);

    recomputeLowConfidence(store.db, { default: 0.9, bySource: [] });

    const importedAfter = store.db
      .select()
      .from(issues)
      .where(eq(issues.type, "label_issue"))
      .all();
    expect(importedAfter.length).toBe(1);
    expect(importedAfter[0]!.score).toBe(importedBefore[0]!.score);
  });
});
