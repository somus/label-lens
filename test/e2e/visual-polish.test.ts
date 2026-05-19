import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import type { ResolvedDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { runSignals } from "../../src/signals/run.ts";
import { displayFor } from "../util/display.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

async function mountAt(
  store: { db: import("../../src/store/db.ts").Db },
  display: ResolvedDisplay,
) {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 120,
    height: 30,
  });
  const app = createAppContext({
    db: store.db,
    config,
    display,
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();
  return { captureCharFrame };
}

describe("Slice 2 visual polish — banded record + badges", () => {
  test("16-color review screen shows confidence-bar glyphs in left edge", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await mountAt(store, displayFor({ color: "16" }));
    const frame = captureCharFrame();
    // At least one block-element glyph should appear in non-focused band rows.
    // tiny.jsonl carries 0.45..0.95 confidences across records.
    const blockGlyphs = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
    expect(blockGlyphs.some((g) => frame.includes(g))).toBe(true);
  });

  test("issue badges render with semantic icon glyphs at truecolor", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    // Threshold lifted so the disagreement record's primary (0.81) also
    // trips low_confidence, giving us both badges on the same frame.
    runSignals(store.db, { lowConfidence: { default: 0.9, bySource: [] } });

    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 120,
      height: 30,
    });
    const app = createAppContext({
      db: store.db,
      config,
      display: displayFor({ color: "truecolor" }),
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app, initialQueueId: "by-issue:source_disagreement" });
    await renderOnce();
    const frame = captureCharFrame();
    // Warning glyph from Badge default icon set.
    expect(frame).toContain("⚠");
    expect(frame).toContain("Model is uncertain");
  });
});
