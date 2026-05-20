import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { Box } from "../../src/render/box.ts";
import type { ResolvedDisplay } from "../../src/render/capability.ts";
import { Chrome, type Segment } from "../../src/render/chrome/index.ts";
import { Text } from "../../src/render/text.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
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
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
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
  mountReviewScreen({ renderer, app });
  await renderOnce();
  mockInput.pressKey("Q", { shift: true });
  await renderOnce();
  return { captureCharFrame };
}

async function setupStats(store: TmpStore, display: ResolvedDisplay) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
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
  mountReviewScreen({ renderer, app });
  await renderOnce();
  mockInput.pressKey("t");
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
    expect(frame).toContain("[j/k] nav");
    expect(frame).toContain("[a] accept");
    expect(frame).toContain("[r] relabel");
    expect(frame).toContain("[i] ask");
    expect(frame).toContain("[x] reject");
    expect(frame).toContain("[s] skip");
    expect(frame).toContain("[n] note");
    expect(frame).toContain("[:] palette");
    // `[?] help` intentionally NOT in the footer — `?` is the universal
    // help key across TUIs; freeing the 9ch slot lets `[i] ask` and the
    // `[/]` cycle hint fit at 120 cols without truncating other items.
    expect(frame).not.toContain("[?] help");
    // Secondary actions (m mark, u undo) discoverable via `?` help —
    // intentionally excluded from the footer to keep it scannable.
    expect(frame).not.toContain("[m] mark");
    expect(frame).not.toContain("[u] undo");
    expect(frame).toContain("[gd] doc");
    // Queue-cycle hint surfaces next to `[Q]` instead of two separate
    // `[/]` entries (saves ~22ch on the row).
    expect(frame).toContain("[Q] queues [/]");
    // `[t] stats` lives in the utility cluster; at 120 cols with `[j/k] nav`
    // added to the primary cluster the row collapses and `stats` truncates.
    // The snapshot guards the exact rendering.
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

  test("queue overlay renders Queues title and queue picker hint", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setupQueue(store, TRUECOLOR_LIGHT);
    const frame = captureCharFrame();
    expect(frame).toContain("LabelLens");
    expect(frame).toContain("Queues");
    expect(frame).toContain("[j/k] navigate");
    expect(frame).toContain("[enter] select");
    expect(frame).toContain("[esc] cancel");
  });

  test("stats overlay renders Stats title and drill hint", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setupStats(store, TRUECOLOR_LIGHT);
    const frame = captureCharFrame();
    expect(frame).toContain("Stats");
    expect(frame).toContain("[j/k] navigate");
    expect(frame).toContain("[enter] drill");
    expect(frame).toContain("[esc] close");
  });

  test("hint-only mode renders status + body + footer with no AppContext or scope", async () => {
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 100,
      height: 12,
    });
    const statusLeft: Segment[] = [
      { text: " LabelLens", tone: "bold" },
      { text: "  ", tone: "dim" },
      { text: "Re-ingest", tone: "warning" },
    ];
    const footerHint: Segment[] = [
      { text: "[r] ", tone: "accent" },
      { text: "refresh  ", tone: "muted" },
      { text: "[c] ", tone: "accent" },
      { text: "cancel", tone: "muted" },
    ];
    const body = Box({ flexDirection: "column", flexGrow: 1 }, Text({ content: " hello body" }));
    renderer.root.add(
      Chrome({
        display: TRUECOLOR_LIGHT,
        statusLeft,
        footerHint,
        body,
      }),
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("LabelLens");
    expect(frame).toContain("Re-ingest");
    expect(frame).toContain("hello body");
    expect(frame).toContain("[r] refresh");
    expect(frame).toContain("[c] cancel");
  });

  test("status bar truncates and drops right cluster on narrow (60-col) terminals", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 60,
      height: 24,
    });
    const app = createAppContext({
      db: store.db,
      config: makeConfig(),
      display: TRUECOLOR_LIGHT,
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app });
    await renderOnce();
    const frame = captureCharFrame();
    // Right cluster (Reviewed/Skipped/Pending counters) must not render at <80 cols.
    expect(frame).not.toContain("Reviewed: 0 / 10");
    // Left cluster must still anchor app + dataset.
    expect(frame).toContain("LabelLens");
  });
});
