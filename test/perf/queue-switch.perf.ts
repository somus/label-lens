import { test } from "bun:test";
import { switchQueue } from "../../src/actions/queue/switch.ts";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";
import { assertPerf } from "./_util.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel"],
    input: { path: "test/fixtures/large.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

// 120s timeout: ingesting large.jsonl (50K records) is the long pole, and
// envelope itself allows up to 10s for export. The measured window is small.
test("queue switch latency on large fixture within envelope", async () => {
  using store = await openTmpStore({ prefix: "perf-queue-", ingest: "large.jsonl" });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });

  // Warm the source cursor so the measurement reflects a cold-target swap,
  // not a first-ever cursor build for either side.
  switchQueue(app, "pending");

  const t0 = performance.now();
  switchQueue(app, "low-confidence");
  const elapsed = performance.now() - t0;
  assertPerf("queue_switch_large_ms", elapsed);
}, 120_000);
