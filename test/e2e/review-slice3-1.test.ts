import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import type { ResolvedDisplay } from "../../src/render/capability.ts";
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

const TRUECOLOR_AUTO: ResolvedDisplay = displayFor({ color: "truecolor", banding: true });
const TWO_FIFTY_SIX_LIGHT: ResolvedDisplay = displayFor({ color: "256", banding: true });
const SIXTEEN_LIGHT: ResolvedDisplay = displayFor({ color: "16" });
const TRUECOLOR_DARK: ResolvedDisplay = displayFor({
  color: "truecolor",
  banding: true,
  theme: "dark",
});

async function setup(
  store: TmpStore,
  display: ResolvedDisplay,
  size: { width: number; height: number },
) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: size.width,
    height: size.height,
  });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    requestRender: () => {},
    onQuit: () => {},
    display,
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();
  return { app, mockInput, renderOnce, captureCharFrame };
}

function frameLines(frame: string): string[] {
  return frame.split("\n");
}

describe("review screen wide-terminal layout (≥160 cols)", () => {
  test("exactly one focus box rendered", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_AUTO, { width: 200, height: 24 });
    const frame = captureCharFrame();
    expect((frame.match(/╭/g) ?? []).length).toBe(1);
  });

  test("classification preview shows neighbours above and below the focus", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, TRUECOLOR_AUTO, {
      width: 200,
      height: 24,
    });
    for (let i = 0; i < 4; i++) {
      mockInput.pressKey("j");
      await renderOnce();
    }
    const frame = captureCharFrame();
    // previewLines = 2 (default), so the focus has 2 neighbours visible
    // above and 2 below — at index 4 those are indexes 2,3 (Netflix,
    // Amazon) above and 5,6 (Rent, Coffee) below.
    expect(frame).toContain("Salary credit October");
    expect(frame).toContain("Netflix monthly");
    expect(frame).toContain("Rent transfer to landlord");
    expect((frame.match(/╭/g) ?? []).length).toBe(1);
    const lines = frameLines(frame);
    const netflixRow = lines.findIndex((l) => l.includes("Netflix monthly"));
    const cornerRow = lines.findIndex((l) => l.includes("╭"));
    const rentRow = lines.findIndex((l) => l.includes("Rent transfer to landlord"));
    expect(netflixRow).toBeLessThan(cornerRow);
    expect(rentRow).toBeGreaterThan(cornerRow);
  });

  test("decision chip rail and headline render in the main column", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_AUTO, {
      width: 200,
      height: 24,
    });
    const frame = captureCharFrame();
    // Decision chip rail: predicted label gets `▸N`, others render
    // numbered without the marker.
    expect(frame).toContain("▸1 food");
    expect(frame).toContain("2 travel");
    expect(frame).toContain("3 other");
    // Source row renders the prediction source as a chip.
    expect(frame).toContain("source");
    expect(frame).toContain("[llm:gpt-4]");
  });

  test("empty queue renders 'All records reviewed' with no focus box", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, TRUECOLOR_AUTO, {
      width: 200,
      height: 24,
    });
    for (let i = 0; i < 10; i++) {
      mockInput.pressKey("a");
      await renderOnce();
    }
    const frame = captureCharFrame();
    expect(frame).toContain("All records reviewed");
    expect((frame.match(/╭/g) ?? []).length).toBe(0);
  });

  test("picker overlay opens via 'r' and renders prompt visibly", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, TRUECOLOR_AUTO, {
      width: 200,
      height: 24,
    });
    mockInput.pressKey("r");
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Relabel");
  });

  test("snapshot: 200x24, truecolor light", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_AUTO, { width: 200, height: 24 });
    const frame = captureCharFrame();
    expect(frame).toMatchSnapshot();
  });

  test("snapshot: 200x24, 256-color light", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TWO_FIFTY_SIX_LIGHT, {
      width: 200,
      height: 24,
    });
    const frame = captureCharFrame();
    expect(frame).toMatchSnapshot();
  });

  test("snapshot: 200x24, 16-color light (markers)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, SIXTEEN_LIGHT, { width: 200, height: 24 });
    const frame = captureCharFrame();
    expect(frame).toMatchSnapshot();
  });

  test("snapshot: 200x24, truecolor dark", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_DARK, { width: 200, height: 24 });
    const frame = captureCharFrame();
    expect(frame).toMatchSnapshot();
  });
});
