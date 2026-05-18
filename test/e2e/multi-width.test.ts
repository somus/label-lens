import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import type { ResolvedDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { mountSplash } from "../../src/screens/splash.ts";
import { displayFor } from "../util/display.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

/**
 * Multi-width snapshot sweep (plan A16). Locks in the visual layout at
 * the three breakpoint widths the rest of the design was sized against:
 *
 *   80  — narrow path, no sidebar, top status bar mode.
 *   120 — sidebar threshold (auto-visible), 32ch sidebar.
 *   160 — split-layout threshold; sidebar still 32ch.
 *
 * Each snapshot is full-frame so any layout regression flips it. Refresh
 * intentionally with `bun test --update-snapshots`.
 */

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

const TRUECOLOR_AUTO: ResolvedDisplay = displayFor({
  color: "truecolor",
  banding: true,
  sidebar: "auto",
  queuePreview: "auto",
});

async function setupReview(
  store: TmpStore,
  display: ResolvedDisplay,
  size: { width: number; height: number },
) {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer(size);
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display,
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();
  return { captureCharFrame };
}

async function setupStats(
  store: TmpStore,
  display: ResolvedDisplay,
  size: { width: number; height: number },
) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer(size);
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display,
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();
  mockInput.pressKey("t");
  await renderOnce();
  return { captureCharFrame };
}

async function setupSplash(display: ResolvedDisplay, size: { width: number; height: number }) {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer(size);
  mountSplash({ renderer, display, onExit: () => {} });
  await renderOnce();
  return { captureCharFrame };
}

const HEIGHT = 30;
const WIDTHS = [80, 120, 160];

describe("multi-width snapshot sweep (plan A16)", () => {
  for (const width of WIDTHS) {
    test(`review screen @ ${width}x${HEIGHT}`, async () => {
      using store = await openTmpStore({ ingest: "tiny.jsonl" });
      const { captureCharFrame } = await setupReview(store, TRUECOLOR_AUTO, {
        width,
        height: HEIGHT,
      });
      const frame = captureCharFrame();
      expect(frame).not.toContain("1Reviewed");
      expect(frame).not.toContain("\n queues");
      if (width >= 120) {
        expect(frame).toContain("Counters");
        expect(frame).toContain("Signals");
      }
      expect(frame).toMatchSnapshot();
    });

    test(`stats overlay @ ${width}x${HEIGHT}`, async () => {
      using store = await openTmpStore({ ingest: "tiny.jsonl" });
      const { captureCharFrame } = await setupStats(store, TRUECOLOR_AUTO, {
        width,
        height: HEIGHT,
      });
      const frame = captureCharFrame();
      expect(frame).toContain("Stats");
      expect(frame).toMatchSnapshot();
    });

    test(`splash screen @ ${width}x${HEIGHT}`, async () => {
      const { captureCharFrame } = await setupSplash(TRUECOLOR_AUTO, {
        width,
        height: HEIGHT,
      });
      const frame = captureCharFrame();
      expect(frame).not.toContain("lalabellens");
      expect(frame).toContain("No labellens.config.json");
      expect(frame).toContain("labellens migrate --rename ...");
      expect(frame).toMatchSnapshot();
    });
  }
});
