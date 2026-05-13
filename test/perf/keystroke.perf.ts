import { test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";
import { assertPerf } from "./_util.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel"],
    input: { path: "test/fixtures/medium.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

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
  // we want to measure for keystroke-to-render envelope.
  const t0 = performance.now();
  mockInput.pressKey("j");
  await renderOnce();
  const elapsed = performance.now() - t0;
  assertPerf("keystroke_j_ms", elapsed);
}, 60_000);
