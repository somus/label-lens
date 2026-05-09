import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "utility", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setup(store: TmpStore) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 110,
    height: 30,
  });

  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    requestRender: () => {},
    onQuit: () => {},
  });

  mountReviewScreen({ renderer, app });
  await renderOnce();
  return { app, mockInput, renderOnce, captureCharFrame };
}

describe("review screen slice 2 UI", () => {
  test("progress strip shows four buckets after a mix of actions", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey("a");
    await renderOnce();
    mockInput.pressKey("x");
    await renderOnce();
    mockInput.pressKey("s");
    await renderOnce();
    mockInput.pressKey("2");
    await renderOnce(); // relabel to travel
    const frame = captureCharFrame();
    expect(frame).toContain("Reviewed: 3 / 10");
    expect(frame).toContain("Skipped: 1");
    expect(frame).toContain("Pending: 6");
  });

  test("label list renders numbered config labels with predicted marker", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store);
    const frame = captureCharFrame();
    expect(frame).toContain("1 food");
    expect(frame).toContain("2 travel");
    expect(frame).toContain("3 utility");
    expect(frame).toContain("4 other");
  });

  test("action bar advertises slice 2 shortcuts", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store);
    const frame = captureCharFrame();
    expect(frame).toContain("a accept");
    expect(frame).toContain("r relabel");
    expect(frame).toContain("x reject");
    expect(frame).toContain("s skip");
    expect(frame).toContain("m mark");
    expect(frame).toContain("n note");
    expect(frame).toContain("u undo");
  });

  test("history strip lists recent decisions", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey("a");
    await renderOnce();
    mockInput.pressKey("2");
    await renderOnce();
    mockInput.pressKey("x");
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("history:");
  });

  test("'r' opens relabel picker overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey("r");
    await renderOnce();
    expect(app.mode).toBe("picker");
    const frame = captureCharFrame();
    expect(frame).toContain("relabel>");
    expect(frame).toContain("food");
    expect(frame).toContain("travel");
    expect(frame).toContain("enter commit");
    expect(frame).toContain("esc cancel");
  });

  test("picker filter narrows candidates", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey("r");
    await renderOnce();
    mockInput.pressKey("t");
    await renderOnce();
    expect(app.mode).toBe("picker");
    expect(app.picker?.filter).toBe("t");
    expect(app.picker?.candidates.map((c) => c.label)).toEqual(["travel", "utility", "other"]);
    const frame = captureCharFrame();
    expect(frame).toContain("relabel> t");
  });

  test("'n' opens note prompt overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey("n");
    await renderOnce();
    expect(app.mode).toBe("note");
    const frame = captureCharFrame();
    expect(frame).toContain("note>");
    expect(frame).toContain("enter save");
  });

  test("'m' shows persistent marked badge in header strip", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    expect(captureCharFrame()).not.toContain("● marked");
    mockInput.pressKey("m");
    await renderOnce();
    expect(captureCharFrame()).toContain("● marked");
    mockInput.pressKey("m");
    await renderOnce();
    expect(captureCharFrame()).not.toContain("● marked");
  });

  test("action bar swaps 'm mark' to 'm unmark' when current record is marked", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    expect(captureCharFrame()).toContain("m mark");
    mockInput.pressKey("m");
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("m unmark");
    expect(frame).not.toContain("m mark ");
  });

  test("picker filter accepts space character", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey("r");
    await renderOnce();
    expect(app.mode).toBe("picker");
    mockInput.pressKey(" ");
    await renderOnce();
    expect(app.picker?.filter).toBe(" ");
  });

  test("note prompt accepts spaces between words", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey("n");
    await renderOnce();
    mockInput.pressKey("h");
    mockInput.pressKey("i");
    mockInput.pressKey(" ");
    mockInput.pressKey("y");
    mockInput.pressKey("o");
    await renderOnce();
    expect(app.notePrompt?.value).toBe("hi yo");
  });
});
