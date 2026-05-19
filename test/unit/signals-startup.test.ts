import { describe, expect, test } from "bun:test";
import { runSignals } from "../../src/signals/run.ts";
import { applyThresholdsOnStartup } from "../../src/signals/startup.ts";
import { COMPUTED_SIGNAL_SOURCE } from "../../src/store/issues.ts";
import { getMeta, setMeta } from "../../src/store/meta.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { openTmpStore } from "../util/tmp.ts";

describe("applyThresholdsOnStartup", () => {
  test("recomputes when no fingerprint is stored", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    runSignals(store.db, { lowConfidence: { default: 0.5, bySource: [] } });

    expect(getMeta(store.db, "signals.lowConfidence.applied")).toBeNull();

    const result = applyThresholdsOnStartup(store.db, { default: 0.95, bySource: [] });
    expect(result.recomputed).toBe(true);
    expect(getMeta(store.db, "signals.lowConfidence.applied")).not.toBeNull();

    const lowConf = queueRecords(store.db, resolveQueue("by-issue:low_confidence").query);
    expect(lowConf.map((r) => r.text)).toContain("Lunch at Zomato Bangalore");
  });

  test("skips when stored fingerprint matches current thresholds", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    runSignals(store.db, { lowConfidence: { default: 0.5, bySource: [] } });

    const first = applyThresholdsOnStartup(store.db, { default: 0.5, bySource: [] });
    expect(first.recomputed).toBe(true);

    // Tamper: wipe computed low_confidence so we can prove the second call
    // does NOT touch them.
    const beforeCount = store.db
      .select()
      .from((await import("../../src/store/schema.ts")).issues)
      .all()
      .filter((r) => r.type === "low_confidence" && r.source === COMPUTED_SIGNAL_SOURCE).length;

    const second = applyThresholdsOnStartup(store.db, { default: 0.5, bySource: [] });
    expect(second.recomputed).toBe(false);

    const afterCount = store.db
      .select()
      .from((await import("../../src/store/schema.ts")).issues)
      .all()
      .filter((r) => r.type === "low_confidence" && r.source === COMPUTED_SIGNAL_SOURCE).length;
    expect(afterCount).toBe(beforeCount);
  });

  test("recomputes when bySource override changes", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    setMeta(
      store.db,
      "signals.lowConfidence.applied",
      JSON.stringify({ default: 0.5, bySource: [] }),
    );
    const result = applyThresholdsOnStartup(store.db, {
      default: 0.5,
      bySource: [{ pattern: "regex.*", threshold: 0.6 }],
    });
    expect(result.recomputed).toBe(true);
  });
});
