import { test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";
import { assertPerf, measureMedian } from "./_util.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel"],
    input: { path: "test/fixtures/medium.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

// Keystroke-to-render shouldn't scale with record count — the work is
// scoped to the visible window, not the full queue. Medium (10K) gives a
// realistic enough render context without paying large.jsonl's ingest cost
// on every CI run.
test("keystroke-to-render on medium fixture within envelope", async () => {
  using store = await openTmpStore({ prefix: "perf-keystroke-", ingest: "medium.jsonl" });

  const { renderer, mockInput, renderOnce } = await createTestRenderer({
    width: 120,
    height: 40,
  });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce(); // settle first frame

  // `j` = record.next: cursor advance, no db write. Pure render cost is what
  // we want to measure for keystroke-to-render envelope. Median-of-3 with
  // one discarded warmup so JIT settles before sampling and a single noisy
  // frame can't push the assertion past the headroom.
  const elapsed = await measureMedian(async () => {
    const t0 = performance.now();
    mockInput.pressKey("j");
    await renderOnce();
    return performance.now() - t0;
  });
  assertPerf("keystroke_j_ms", elapsed);
}, 60_000);
