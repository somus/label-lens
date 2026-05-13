import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import type { ResolvedDisplay } from "../../src/render/capability.ts";
import { mountQueueScreen } from "../../src/screens/queue.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { mountStatsScreen } from "../../src/screens/stats.ts";
import { displayFor } from "../util/display.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

const TRUECOLOR_LIGHT: ResolvedDisplay = displayFor({ color: "truecolor" });
const TWO_FIFTY_SIX_DARK: ResolvedDisplay = displayFor({
  color: "256",
  banding: true,
  theme: "dark",
});
const SIXTEEN: ResolvedDisplay = displayFor({ color: "16" });
const MONO: ResolvedDisplay = displayFor({ color: "mono" });

async function setupReview(store: TmpStore, display: ResolvedDisplay) {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 120,
    height: 24,
  });
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

async function setupQueue(store: TmpStore, display: ResolvedDisplay) {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 120,
    height: 24,
  });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display,
    requestRender: () => {},
    onQuit: () => {},
  });
  app.queueId = "pending";
  mountQueueScreen({
    renderer,
    app,
    onSelect: () => {},
    onCancel: () => {},
  });
  await renderOnce();
  return { captureCharFrame };
}

async function setupStats(store: TmpStore, display: ResolvedDisplay) {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 120,
    height: 30,
  });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display,
    requestRender: () => {},
    onQuit: () => {},
  });
  mountStatsScreen({
    renderer,
    app,
    onDrill: () => {},
    onCancel: () => {},
  });
  await renderOnce();
  return { captureCharFrame };
}

describe("chrome — status bar + action footer", () => {
  test("review screen renders status bar with queue and counts, footer with action hints", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setupReview(store, TRUECOLOR_LIGHT);
    const frame = captureCharFrame();
    // Status bar (top).
    expect(frame).toContain("LabelLens");
    expect(frame).toContain("tiny.jsonl");
    expect(frame).toContain("Pending");
    expect(frame).toContain("1 / 10");
    expect(frame).toContain("Reviewed: 0 / 10");
    expect(frame).toContain("Skipped: 0");
    // Action footer (bottom). Primary review commands must appear.
    expect(frame).toContain("[a] accept");
    expect(frame).toContain("[r] relabel");
    expect(frame).toContain("[x] reject");
    expect(frame).toContain("[s] skip");
    expect(frame).toContain("[n] note");
    expect(frame).toContain("[:] palette");
    expect(frame).toContain("[?] help");
    expect(frame).toContain("[t] stats");
    // Secondary actions (m mark, u undo, j next) discoverable via `?` help —
    // intentionally excluded from the footer to keep it scannable.
    expect(frame).not.toContain("[m] mark");
    expect(frame).not.toContain("[u] undo");
    // Boundary-only command must NOT appear in classification mode.
    expect(frame).not.toContain("[gd] doc");
  });

  test("review chrome renders on truecolor", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setupReview(store, TRUECOLOR_LIGHT);
    expect(captureCharFrame()).toMatchSnapshot();
  });

  test("review chrome renders on 256-color dark", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setupReview(store, TWO_FIFTY_SIX_DARK);
    expect(captureCharFrame()).toMatchSnapshot();
  });

  test("review chrome renders on 16-color (no fg styling)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setupReview(store, SIXTEEN);
    const frame = captureCharFrame();
    expect(frame).toContain("[a] accept");
    expect(frame).toMatchSnapshot();
  });

  test("review chrome renders on mono", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setupReview(store, MONO);
    const frame = captureCharFrame();
    expect(frame).toContain("[a] accept");
    expect(frame).toMatchSnapshot();
  });

  test("queue screen renders chrome with Queues title and queue picker hint", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setupQueue(store, TRUECOLOR_LIGHT);
    const frame = captureCharFrame();
    expect(frame).toContain("LabelLens");
    expect(frame).toContain("Queues");
    expect(frame).toContain("[j/k] navigate");
    expect(frame).toContain("[enter] select");
    expect(frame).toContain("[esc] cancel");
    // The status row also reflects total queue count.
    expect(frame).toMatch(/\d+ queues/);
  });

  test("stats screen renders chrome with Stats title and drill hint", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setupStats(store, TRUECOLOR_LIGHT);
    const frame = captureCharFrame();
    expect(frame).toContain("Stats");
    expect(frame).toContain("[j/k] navigate");
    expect(frame).toContain("[enter] drill");
    expect(frame).toContain("[esc] back");
  });
});
