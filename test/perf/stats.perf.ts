import { test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountStatsScreen } from "../../src/screens/stats.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { allStats } from "../../src/store/stats.ts";
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

test("stats aggregate + render on large fixture within envelope", async () => {
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

  const t0 = performance.now();
  allStats(store.db);
  const aggregateElapsed = performance.now() - t0;
  assertPerf("stats_aggregate_large_ms", aggregateElapsed);

  const { renderer, renderOnce } = await createTestRenderer({ width: 100, height: 30 });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });

  const t1 = performance.now();
  mountStatsScreen({ renderer, app, onDrill: () => {}, onCancel: () => {} });
  await renderOnce();
  const renderElapsed = performance.now() - t1;
  assertPerf("stats_render_large_ms", renderElapsed);
}, 120_000);
