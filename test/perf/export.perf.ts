import { test } from "bun:test";
import { exportJsonlString } from "../../src/export/jsonl.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { openTmpStore } from "../util/tmp.ts";
import { assertPerf, measureMedian } from "./_util.ts";

const REVIEW_RATIO = 0.1;

test("export jsonl on large fixture within envelope", async () => {
  using store = await openTmpStore({ prefix: "perf-export-", ingest: "large.jsonl" });

  // Seed ~10% of records as accepted reviews so the export emits a realistic
  // payload — empty `effective_reviews` would short-circuit the loop and
  // give a meaningless measurement.
  const records = queueRecords(store.db, resolveQueue("pending").query);
  const reviewCount = Math.floor(records.length * REVIEW_RATIO);
  store.db.transaction((tx) => {
    for (let i = 0; i < reviewCount; i++) {
      const r = records[i]!;
      const label = r.primaryPrediction?.label ?? null;
      insertReview(tx, {
        record_id: r.id,
        status: "accepted",
        final_label: label,
        prev_label: label,
        source_of_truth: "human",
      });
    }
  });

  // Export is pure read — each sample is idempotent. 4 calls × ~860ms ≈ 3.5s
  // extra on top of the heavy ingest setup; CI budget still well under 120s.
  const elapsed = await measureMedian(async () => {
    const t0 = performance.now();
    const out = exportJsonlString(store.db, {});
    const ms = performance.now() - t0;
    if (out.length === 0) throw new Error("export produced empty string");
    return ms;
  });
  assertPerf("export_large_ms", elapsed);
}, 120_000);
