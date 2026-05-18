import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay, type ResolvedDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { toggleTag } from "../../src/store/tags.ts";
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
  mountReviewScreen({ renderer, app });
  await renderOnce();
  mockInput.pressKey("Q", { shift: true });
  await renderOnce();
  return { app, mockInput, renderOnce, captureCharFrame };
}

function display(color: ResolvedDisplay["color"]): ResolvedDisplay {
  return { ...defaultDisplay(), color };
}

function markFirstPending(store: TmpStore): void {
  const first = queueRecords(store.db, resolveQueue("pending").query)[0]!;
  toggleTag(store.db, first.id, "marked");
}

describe("queue overlay e2e", () => {
  test("renders all built-in queues with counts", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, captureCharFrame } = await setup(store);
    const frame = captureCharFrame();
    expect(app.overlay?.kind).toBe("queue");
    expect(frame).toContain("Queues");
    expect(frame).toContain("Pending");
    expect(frame).toContain("Skipped");
    expect(frame).toContain("Low confidence");
    expect(frame).toContain("Disagreements");
    expect(frame).toContain("Flagged");
    expect(frame).toContain("Marked");
    expect(frame).toContain("10");
    expect(frame).toContain("Awaiting your label");
    expect(frame).toMatchSnapshot();
  });

  test("Enter on the first queue switches to pending and closes", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.queueId).toBe("pending");
    expect(app.overlay).toBeNull();
  });

  test("Enter on Marked switches through the registered queue command", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    markFirstPending(store);
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.queueId).toBe("marked");
    expect(app.overlay).toBeNull();
  });

  test("j/k moves the highlight; Enter picks low-confidence after three j's", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.queueId).toBe("low-confidence");
    expect(app.overlay).toBeNull();
  });

  test("escape closes the overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressEscape();
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.overlay).toBeNull();
  });

  test("q closes the overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey("q");
    await renderOnce();
    expect(app.overlay).toBeNull();
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

  test("Enter on an empty queue stays open and does not switch", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("RETURN");
    await renderOnce();
    expect(app.queueId).toBe("pending");
    expect(app.overlay?.kind).toBe("queue");
  });
});
