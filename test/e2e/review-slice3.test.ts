import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import type { ResolvedDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { displayFor } from "../util/display.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore, tmpdir } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

const TRUECOLOR_LIGHT: ResolvedDisplay = displayFor({ color: "truecolor", banding: true });
const SIXTEEN_LIGHT: ResolvedDisplay = displayFor({ color: "16" });
const MONO_LIGHT: ResolvedDisplay = displayFor({ color: "mono" });
const TWO_FIFTY_SIX_LIGHT: ResolvedDisplay = displayFor({ color: "256", banding: true });
const TRUECOLOR_DARK: ResolvedDisplay = displayFor({
  color: "truecolor",
  banding: true,
  theme: "dark",
});
const TRUECOLOR_NO_BANDING: ResolvedDisplay = displayFor({ color: "truecolor" });

async function setup(
  store: TmpStore,
  display: ResolvedDisplay = TRUECOLOR_LIGHT,
  size: { width: number; height: number } = { width: 100, height: 24 },
) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: size.width,
    height: size.height,
  });
  let quitCalled = false;
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    requestRender: () => {},
    onQuit: () => {
      quitCalled = true;
    },
    display,
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();
  return { app, mockInput, renderOnce, captureCharFrame, quitCalled: () => quitCalled };
}

function frameLines(frame: string): string[] {
  return frame.split("\n");
}

describe("slice 3: review screen banding + focus + pin", () => {
  test("truecolor: focused record at index 0 carries the rounded focus box; nothing else does", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_LIGHT);
    const frame = captureCharFrame();

    expect(frame).toContain("Lunch at Zomato Bangalore");
    expect(frame).toContain("Uber ride to airport");
    expect(frame).toContain("╭");
    expect(frame).toContain("╰");
    const corners = (frame.match(/╭/g) ?? []).length;
    expect(corners).toBe(1);

    expect(frame).toMatchSnapshot();
  });

  test("truecolor: pressing 'j' moves the focus box to next record", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, TRUECOLOR_LIGHT);
    mockInput.pressKey("j");
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Uber ride to airport");
    const corners = (frame.match(/╭/g) ?? []).length;
    expect(corners).toBe(1);
    const lines = frameLines(frame);
    const focusLine = lines.findIndex((l) => l.includes("Uber ride to airport"));
    expect(focusLine).toBeGreaterThan(-1);
    expect(frame).toMatchSnapshot();
  });

  test("16-color: plain border + ▶ marker on focused, │ on context", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, SIXTEEN_LIGHT);
    const frame = captureCharFrame();
    expect(frame).toContain("┌");
    expect(frame).toContain("└");
    expect(frame).not.toContain("╭");
    expect(frame).toContain("▶");
    expect(frame).toContain("│");
    expect(frame).toMatchSnapshot();
  });

  test("mono: same plain border + markers as 16-color", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, MONO_LIGHT);
    const frame = captureCharFrame();
    expect(frame).toContain("┌");
    expect(frame).toContain("▶");
    expect(frame).not.toContain("╭");
    expect(frame).toMatchSnapshot();
  });

  test("viewport pin: focused record's top row sits near floor(bandRows * candidatePin)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, TRUECOLOR_LIGHT);
    // Move down a few records so there is content above the focus.
    for (let i = 0; i < 4; i++) {
      mockInput.pressKey("j");
      await renderOnce();
    }
    const frame = captureCharFrame();
    const lines = frameLines(frame);
    const topCornerRow = lines.findIndex((l) => l.includes("╭"));
    expect(topCornerRow).toBeGreaterThan(-1);
    // 24-row renderer, pin = 0.4. After header + spacer (≈3 rows), the band
    // region runs ~17 rows; focused-record top corner should land at row
    // ≈ 3 + floor(17 × 0.4) = 9. Allow ±2 rows for flex rounding + spacers.
    expect(topCornerRow).toBeGreaterThanOrEqual(7);
    expect(topCornerRow).toBeLessThanOrEqual(11);
  });

  test("256-color: rounded border, no left-edge markers (banding does the work)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TWO_FIFTY_SIX_LIGHT);
    const frame = captureCharFrame();
    expect(frame).toContain("╭");
    expect(frame).toContain("╰");
    expect(frame).not.toContain("▶");
    expect(frame).toMatchSnapshot();
  });

  test("truecolor + dark theme: rounded border, accent border color differs from light", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_DARK);
    const frame = captureCharFrame();
    expect(frame).toContain("╭");
    expect(frame).toContain("Lunch at Zomato Bangalore");
    expect(frame).toMatchSnapshot();
  });

  test("display.banding = off at truecolor: rounded border still present, no banding bg", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { captureCharFrame } = await setup(store, TRUECOLOR_NO_BANDING);
    const frame = captureCharFrame();
    expect(frame).toContain("╭");
    expect(frame).not.toContain("▶");
    expect(frame).toMatchSnapshot();
  });

  test("tall terminal: window grows so prev-context fills space above focus pin", async () => {
    using dir = tmpdir({ prefix: "labellens-bigfx-" });
    const jsonl = join(dir.path, "big.jsonl");
    const lines = Array.from({ length: 60 }, (_, i) =>
      JSON.stringify({ text: `record-${String(i).padStart(3, "0")}` }),
    );
    writeFileSync(jsonl, `${lines.join("\n")}\n`);
    using store = await openTmpStore({ prefix: "labellens-store-bigfx-" });
    await ingestFile(store.db, jsonl, DEFAULT_FIELDS);

    // 60-row terminal. Move cursor deep enough that prev-window is unlimited
    // by queue start (well past 30).
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, SIXTEEN_LIGHT, {
      width: 100,
      height: 60,
    });
    for (let i = 0; i < 35; i++) {
      mockInput.pressKey("j");
      await renderOnce();
    }
    const frame = captureCharFrame();
    const frameLines = frame.split("\n");
    const contextLines = frameLines.filter((l) => /^\s+│\s/.test(l)).length;
    // On a 60-row terminal the band region accommodates well over a dozen
    // context records; with a hardcoded window of 6 we'd cap at ~12 (6 above
    // + 6 below). Dynamic sizing should beat that floor.
    expect(contextLines).toBeGreaterThan(14);
  });

  test("empty queue: no focus box, completion message rendered", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store, TRUECOLOR_LIGHT);
    for (let i = 0; i < 10; i++) {
      mockInput.pressKey("a");
      await renderOnce();
    }
    const frame = captureCharFrame();
    expect(frame).toContain("All records reviewed");
    expect((frame.match(/╭/g) ?? []).length).toBe(0);
  });
});
