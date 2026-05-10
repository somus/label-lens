import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
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

async function setup(store: TmpStore) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 100,
    height: 30,
  });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display: defaultDisplay(),
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
    mockInput,
    renderOnce,
    captureCharFrame,
    selected: () => selected,
    cancelled: () => cancelled,
    destroy: handle.destroy,
  };
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

  test("j/k moves the highlight; Enter picks low-confidence after two j's", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, selected } = await setup(store);
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
});
