import { test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";
import { assertPerf } from "./_util.ts";

const REVIEW_RATIO = 0.1;

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel"],
    input: { path: "test/fixtures/large.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

// Measures user-felt cost of opening the stats overlay: aggregation + first
// frame. stats.show calls allStats internally, so a separate
// "aggregate only" timing would just double-count the same work — and the
// PRD §10.8 envelope is phrased around the open-to-first-frame experience.
test("stats overlay opens on large fixture within envelope", async () => {
  using store = await openTmpStore({ prefix: "perf-stats-", ingest: "large.jsonl" });

  // Seed reviews so stats has signal to aggregate over — empty reviews would
  // short-circuit most sections.
  const records = queueRecords(store.db, resolveQueue("pending").query);
  const reviewCount = Math.floor(records.length * REVIEW_RATIO);
  store.db.transaction((tx) => {
    for (let i = 0; i < reviewCount; i++) {
      const r = records[i]!;
      const label = r.primaryPrediction?.label ?? null;
      insertReview(tx, {
        record_id: r.id,
        status: i % 2 === 0 ? "accepted" : "relabeled",
        final_label: label,
        prev_label: label,
        source_of_truth: "human",
      });
    }
  });

  const { renderer, mockInput, renderOnce } = await createTestRenderer({ width: 100, height: 30 });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });

  mountReviewScreen({ renderer, app });
  await renderOnce();
  const t0 = performance.now();
  mockInput.pressKey("t");
  await renderOnce();
  const elapsed = performance.now() - t0;
  assertPerf("stats_open_large_ms", elapsed);
}, 120_000);
