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
  test("auto + width 200: exactly one focus box, anchored in the center column", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_AUTO, { width: 200, height: 24 });
    const frame = captureCharFrame();
    expect((frame.match(/╭/g) ?? []).length).toBe(1);
    const lines = frameLines(frame);
    const cornerRow = lines.find((l) => l.includes("╭"))!;
    const cornerCol = cornerRow.indexOf("╭");
    // Center column starts roughly 1/3 in (left col is ~1/3 of 200) and ends
    // roughly 2/3 in. Allow generous slack for borders/padding.
    expect(cornerCol).toBeGreaterThan(40);
    expect(cornerCol).toBeLessThan(140);
  });

  test("auto + width 200: prev records appear in left column without focus box", async () => {
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
    // Earlier records show as left-column context.
    expect(frame).toContain("Lunch at Zomato Bangalore");
    expect(frame).toContain("Uber ride to airport");
    // Currently focused record: Salary credit October (index 4).
    expect(frame).toContain("Salary credit October");
    // Only one focus box.
    expect((frame.match(/╭/g) ?? []).length).toBe(1);
    // Lunch sits to the left of the focus box.
    const lines = frameLines(frame);
    const lunchRow = lines.find((l) => l.includes("Lunch at Zomato Bangalore"))!;
    const cornerLine = lines.find((l) => l.includes("╭"))!;
    expect(lunchRow.indexOf("Lunch")).toBeLessThan(cornerLine.indexOf("╭"));
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
    // Right column is to the right of the focus box.
    const lines = frameLines(frame);
    const cornerLine = lines.find((l) => l.includes("╭"))!;
    const histLine = lines.find((l) => l.includes("history:"))!;
    expect(histLine.indexOf("history:")).toBeGreaterThan(cornerLine.indexOf("╭") + 4);
  });

  test("auto + width 200: focused record's top corner sits near pin row in center column", async () => {
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
    // Same envelope as stack pin test — header + spacer ≈3 rows, band region
    // ≈17 rows on a 24-row screen, pin = 0.4 → ≈ row 9, ±2 slack.
    expect(topCornerRow).toBeGreaterThanOrEqual(7);
    expect(topCornerRow).toBeLessThanOrEqual(11);
  });

  test("display.layout = 'stack' forces stack at width 200", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, TRUECOLOR_FORCE_STACK, {
      width: 200,
      height: 24,
    });
    for (let i = 0; i < 2; i++) {
      mockInput.pressKey("j");
      await renderOnce();
    }
    const frame = captureCharFrame();
    const lines = frameLines(frame);
    // In stack, prev records appear ABOVE the focus box, never to its left.
    const lunchRow = lines.findIndex((l) => l.includes("Lunch at Zomato Bangalore"));
    const cornerRow = lines.findIndex((l) => l.includes("╭"));
    expect(lunchRow).toBeGreaterThan(-1);
    expect(cornerRow).toBeGreaterThan(-1);
    expect(lunchRow).toBeLessThan(cornerRow);
  });

  test("display.layout = 'split' forces split at width 100", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, TRUECOLOR_FORCE_SPLIT, {
      width: 100,
      height: 24,
    });
    for (let i = 0; i < 2; i++) {
      mockInput.pressKey("j");
      await renderOnce();
    }
    const frame = captureCharFrame();
    const lines = frameLines(frame);
    const lunchLine = lines.find((l) => l.includes("Lunch at Zomato Bangalore"));
    const cornerLine = lines.find((l) => l.includes("╭"));
    expect(lunchLine).toBeDefined();
    expect(cornerLine).toBeDefined();
    // Split: lunch on the same/earlier rows as corner, but to its left.
    expect(lunchLine!.indexOf("Lunch")).toBeLessThan(cornerLine!.indexOf("╭"));
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
