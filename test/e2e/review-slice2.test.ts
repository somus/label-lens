import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
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
    display: defaultDisplay(),
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
    // Primary review actions live on the chrome footer. Secondary bindings
    // (m mark, u undo, j next, ]/[ cycle, etc.) are discoverable via `?`
    // and the command palette — not duplicated on the footer.
    expect(frame).toContain("[a] accept");
    expect(frame).toContain("[r] relabel");
    expect(frame).toContain("[x] reject");
    expect(frame).toContain("[s] skip");
    expect(frame).toContain("[n] note");
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
    expect(app.overlay?.kind).toBe("picker");
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
    expect(app.overlay?.kind).toBe("picker");
    if (app.overlay?.kind === "picker") {
      expect(app.overlay.state.filter).toBe("t");
      expect(app.overlay.state.candidates.map((c) => c.label)).toEqual([
        "travel",
        "utility",
        "other",
      ]);
    }
    const frame = captureCharFrame();
    expect(frame).toContain("relabel> t");
  });

  test("'n' opens note prompt overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey("n");
    await renderOnce();
    expect(app.overlay?.kind).toBe("note");
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

  test("status bar surfaces the marked indicator when current record is marked", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    // `m` lives under `?` help — the visual signal is the ● indicator in the
    // status bar, not a footer relabel.
    expect(captureCharFrame()).not.toContain("● marked");
    mockInput.pressKey("m");
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("● marked");
  });

  test("picker filter accepts space character", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey("r");
    await renderOnce();
    expect(app.overlay?.kind).toBe("picker");
    mockInput.pressKey(" ");
    await renderOnce();
    if (app.overlay?.kind === "picker") expect(app.overlay.state.filter).toBe(" ");
    else throw new Error("expected picker overlay");
  });

  test("header shows '<position> / <total>' indicator and advances on action", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    expect(captureCharFrame()).toContain("Pending  1 / 10");
    mockInput.pressKey("a");
    await renderOnce();
    expect(captureCharFrame()).toContain("Pending  1 / 9");
  });

  test("']' switches to the skipped queue and updates header", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    expect(captureCharFrame()).toContain("Pending");
    mockInput.pressKey("s");
    await renderOnce();
    mockInput.pressKey("]");
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Skipped");
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
    if (app.overlay?.kind === "note") expect(app.overlay.state.value).toBe("hi yo");
    else throw new Error("expected note overlay");
  });
});
