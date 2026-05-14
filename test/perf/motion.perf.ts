import { expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { displayFor } from "../util/display.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel"],
    input: { path: "test/fixtures/medium.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function measureKeystrokes(motion: boolean): Promise<number> {
  using store = await openTmpStore({
    prefix: `perf-motion-${motion ? "on" : "off"}-`,
    ingest: "medium.jsonl",
  });
  const { renderer, mockInput, renderOnce } = await createTestRenderer({
    width: 120,
    height: 40,
  });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display: displayFor({ color: "truecolor", motion }),
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();

  const samples: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now();
    mockInput.pressKey(i % 2 === 0 ? "j" : "k");
    await renderOnce();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

test("motion enabled stays within 5% of motion off for review keystrokes", async () => {
  const off = await measureKeystrokes(false);
  const on = await measureKeystrokes(true);
  console.log(`[perf] motion_on=${on.toFixed(1)}ms motion_off=${off.toFixed(1)}ms`);
  expect(on).toBeLessThanOrEqual(off * 1.05);
}, 60_000);
