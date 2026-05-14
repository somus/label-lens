import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay, type ResolvedDisplay } from "../../src/render/capability.ts";
import { mountQueueScreen } from "../../src/screens/queue.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setup(
  store: TmpStore,
  opts: { width?: number; height?: number; display?: ResolvedDisplay } = {},
) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: opts.width ?? 100,
    height: opts.height ?? 30,
  });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display: opts.display ?? defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  let selected: string | null = null;
  let cancelled = false;
  const handle = mountQueueScreen({
    renderer,
    app,
    onSelect: (id) => {
      selected = id;
    },
    onCancel: () => {
      cancelled = true;
    },
  });
  await renderOnce();
  return {
    app,
    mockInput,
    renderOnce,
    captureCharFrame,
    selected: () => selected,
    cancelled: () => cancelled,
    destroy: handle.destroy,
  };
}

function display(color: ResolvedDisplay["color"]): ResolvedDisplay {
  return { color, banding: false, theme: "light", candidatePin: 0.4, layout: "auto" };
}

describe("queue screen e2e", () => {
  test("renders all built-in queues with counts", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store);
    const frame = captureCharFrame();
    expect(frame).toContain("Queues");
    expect(frame).toContain("Pending");
    expect(frame).toContain("Skipped");
    expect(frame).toContain("Low confidence");
    expect(frame).toContain("Disagreements");
    expect(frame).toContain("Flagged");
    expect(frame).toContain("Marked");
    // tiny.jsonl: 10 pending, 0 skipped, 1 flagged (label_issue).
    expect(frame).toContain("10");
    expect(frame).toContain("Pending  ");
    expect(frame).toMatchSnapshot();
  });

  test("Enter on the first queue calls onSelect with that id", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, selected } = await setup(store);
    mockInput.pressKey("RETURN");
    await renderOnce();
    expect(selected()).toBe("pending");
  });

  test("j/k moves the highlight; Enter picks low-confidence after three j's (skipping the Signal section header)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, selected } = await setup(store);
    // Section order: pending, skipped, marked, low-confidence, disagreements, flagged.
    // Three j's from pending lands on low-confidence (10 records → not empty → selects).
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("RETURN");
    await renderOnce();
    expect(selected()).toBe("low-confidence");
  });

  test("escape calls onCancel", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, cancelled } = await setup(store);
    mockInput.pressEscape();
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(cancelled()).toBe(true);
  });

  test("q calls onCancel", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, cancelled } = await setup(store);
    mockInput.pressKey("q");
    await renderOnce();
    expect(cancelled()).toBe(true);
  });

  test("renders section headers with Unicode icons on truecolor", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, { display: display("truecolor") });
    const frame = captureCharFrame();
    expect(frame).toContain("⊞");
    expect(frame).toContain("Review Queues");
    expect(frame).toContain("◆");
    expect(frame).toContain("Signal Queues");
  });

  test("drops section icons on 16-color but keeps section titles", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, { display: display("16") });
    const frame = captureCharFrame();
    expect(frame).not.toContain("⊞");
    expect(frame).not.toContain("◆");
    expect(frame).toContain("Review Queues");
    expect(frame).toContain("Signal Queues");
  });

  test("renders per-queue description text", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, { display: display("truecolor") });
    const frame = captureCharFrame();
    expect(frame).toContain("Awaiting your label");
  });

  test("renders progress bar on wide terminal", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, { display: display("truecolor") });
    const frame = captureCharFrame();
    // Bracketed bar appears at least once. Truecolor renders block glyphs.
    expect(frame).toContain("[");
    expect(frame).toMatch(/[█░]/);
  });

  test("Enter on an empty queue flashes a hint and does not select", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, selected, app } = await setup(store);
    // tiny.jsonl: skipped is empty (count 0). Section order puts skipped at
    // index 1. One j press lands on it.
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("RETURN");
    await renderOnce();
    expect(selected()).toBeNull();
    expect(app.flash?.message).toContain("empty");
    expect(app.flash?.kind).toBe("info");
  });

  test("drops progress bars on narrow terminal (<60 cols)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, {
      width: 55,
      display: display("truecolor"),
    });
    const frame = captureCharFrame();
    expect(frame).not.toMatch(/[█░]/);
    // Counts still visible.
    expect(frame).toContain("10");
  });
});
