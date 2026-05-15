import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay, type ResolvedDisplay } from "../../src/render/capability.ts";
import { mountQueueScreen } from "../../src/screens/queue.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

function displayFor(color: ResolvedDisplay["color"]): ResolvedDisplay {
  return {
    color,
    banding: false,
    theme: "light",
    candidatePin: 0.4,
    layout: "auto",
    motion: false,
  };
}

async function setup(store: TmpStore, opts: { width?: number; display?: ResolvedDisplay } = {}) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: opts.width ?? 120,
    height: 40,
  });
  const app = createAppContext({
    db: store.db,
    config,
    display: opts.display ?? defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  mountQueueScreen({
    renderer,
    app,
    onSelect: () => {},
    onCancel: () => {},
  });
  await renderOnce();
  return { app, mockInput, renderOnce, captureCharFrame };
}

describe("queue screen — live preview", () => {
  test("renders first-record preview for highlighted queue (pending → 'Lunch at Zomato Bangalore')", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, { display: displayFor("truecolor") });
    expect(captureCharFrame()).toContain("Lunch at Zomato Bangalore");
  });

  test("preview updates as highlight moves to low-confidence", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, {
      display: displayFor("truecolor"),
    });
    // pending → skipped → marked → low-confidence (three j presses).
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("j");
    await renderOnce();
    mockInput.pressKey("j");
    await renderOnce();
    // Lowest-confidence row in tiny.jsonl is "ATM withdrawal" (0.22).
    expect(captureCharFrame()).toContain("ATM withdrawal");
  });

  test("drops preview at mono", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, { display: displayFor("mono") });
    expect(captureCharFrame()).not.toContain("Lunch at Zomato Bangalore");
  });

  test("drops preview at <60 cols", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, {
      width: 55,
      display: displayFor("truecolor"),
    });
    expect(captureCharFrame()).not.toContain("Lunch at Zomato Bangalore");
  });

  test("empty queue: preview shows '(no records)' placeholder", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, {
      display: displayFor("truecolor"),
    });
    // pending → skipped (count 0).
    mockInput.pressKey("j");
    await renderOnce();
    expect(captureCharFrame()).toContain("(no records)");
  });
});
