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
const TRUECOLOR_FORCE_STACK: ResolvedDisplay = displayFor({
  color: "truecolor",
  banding: true,
  layout: "stack",
});
const TRUECOLOR_FORCE_SPLIT: ResolvedDisplay = displayFor({
  color: "truecolor",
  banding: true,
  layout: "split",
});
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

describe("slice 3.1: responsive split layout at width >= 160", () => {
  test("auto + width 200: exactly one focus box", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_AUTO, { width: 200, height: 24 });
    const frame = captureCharFrame();
    expect((frame.match(/╭/g) ?? []).length).toBe(1);
  });

  test("auto + width 200: prev records appear ABOVE the focus box (vertical band)", async () => {
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
    // Earlier records show as vertical context above focus.
    expect(frame).toContain("Uber ride to airport");
    // Currently focused: Salary credit October (index 4).
    expect(frame).toContain("Salary credit October");
    expect((frame.match(/╭/g) ?? []).length).toBe(1);
    const lines = frameLines(frame);
    const uberRow = lines.findIndex((l) => l.includes("Uber ride to airport"));
    const cornerRow = lines.findIndex((l) => l.includes("╭"));
    expect(uberRow).toBeGreaterThan(-1);
    expect(cornerRow).toBeGreaterThan(-1);
    expect(uberRow).toBeLessThan(cornerRow);
  });

  test("auto + width 200: history strip + label list render in right column", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, TRUECOLOR_AUTO, {
      width: 200,
      height: 24,
    });
    for (let i = 0; i < 3; i++) {
      mockInput.pressKey("a");
      await renderOnce();
    }
    const frame = captureCharFrame();
    expect(frame).toContain("history:");
    expect(frame).toContain("1 food");
    expect(frame).toContain("2 travel");
    expect(frame).toContain("3 other");
    // Right column metadata sits in the right ~third of the frame.
    const lines = frameLines(frame);
    const histLine = lines.find((l) => l.includes("history:"))!;
    const labelLine = lines.find((l) => l.includes("1 food"))!;
    // Split right column starts roughly 2/3 of width. At 200 cols, expect col >= 100.
    expect(histLine.indexOf("history:")).toBeGreaterThan(100);
    expect(labelLine.indexOf("1 food")).toBeGreaterThan(100);
  });

  test("auto + width 200: focused record's top corner sits near pin row", async () => {
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
    const lines = frameLines(frame);
    const topCornerRow = lines.findIndex((l) => l.includes("╭"));
    expect(topCornerRow).toBeGreaterThan(-1);
    // 24-row terminal, pin = 0.4. Header + spacer ≈3 rows, band region
    // ≈17 rows; focused-record top corner ≈ row 3 + floor(17 × 0.4) = 9. ±2.
    expect(topCornerRow).toBeGreaterThanOrEqual(7);
    expect(topCornerRow).toBeLessThanOrEqual(11);
  });

  test("display.layout = 'stack' at width 200: label list at LEFT (no right column)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_FORCE_STACK, {
      width: 200,
      height: 24,
    });
    const frame = captureCharFrame();
    const lines = frameLines(frame);
    // Stack: label list sits at far left of frame, not in a right column.
    const labelLine = lines.find((l) => l.includes("1 food"))!;
    expect(labelLine).toBeDefined();
    expect(labelLine.indexOf("1 food")).toBeLessThan(20);
  });

  test("display.layout = 'split' at width 100: label list at RIGHT third", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_FORCE_SPLIT, {
      width: 100,
      height: 24,
    });
    const frame = captureCharFrame();
    const lines = frameLines(frame);
    // Split: label list sits in the right ~third of frame; at 100 cols, expect col >= 50.
    const labelLine = lines.find((l) => l.includes("1 food"))!;
    expect(labelLine).toBeDefined();
    expect(labelLine.indexOf("1 food")).toBeGreaterThan(50);
  });

  test("split: empty queue renders 'All records reviewed' with no focus box", async () => {
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

  test("split: picker overlay opens via 'r' and renders prompt visibly", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, TRUECOLOR_AUTO, {
      width: 200,
      height: 24,
    });
    mockInput.pressKey("r");
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("relabel>");
  });

  test("snapshot: split layout at 200x24, truecolor light", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_AUTO, { width: 200, height: 24 });
    const frame = captureCharFrame();
    expect(frame).toMatchSnapshot();
  });

  test("snapshot: split layout at 200x24, 256-color light", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TWO_FIFTY_SIX_LIGHT, {
      width: 200,
      height: 24,
    });
    const frame = captureCharFrame();
    expect(frame).toMatchSnapshot();
  });

  test("snapshot: split layout at 200x24, 16-color light (markers)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, SIXTEEN_LIGHT, { width: 200, height: 24 });
    const frame = captureCharFrame();
    expect(frame).toMatchSnapshot();
  });

  test("snapshot: split layout at 200x24, truecolor dark", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_DARK, { width: 200, height: 24 });
    const frame = captureCharFrame();
    expect(frame).toMatchSnapshot();
  });
});
