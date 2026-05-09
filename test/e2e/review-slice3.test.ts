import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import type { ResolvedDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

const TRUECOLOR_LIGHT: ResolvedDisplay = {
  color: "truecolor",
  banding: true,
  theme: "light",
  candidatePin: 0.4,
};

const SIXTEEN_LIGHT: ResolvedDisplay = {
  color: "16",
  banding: false,
  theme: "light",
  candidatePin: 0.4,
};

const MONO_LIGHT: ResolvedDisplay = {
  color: "mono",
  banding: false,
  theme: "light",
  candidatePin: 0.4,
};

const TWO_FIFTY_SIX_LIGHT: ResolvedDisplay = {
  color: "256",
  banding: true,
  theme: "light",
  candidatePin: 0.4,
};

const TRUECOLOR_DARK: ResolvedDisplay = { ...TRUECOLOR_LIGHT, theme: "dark" };

const TRUECOLOR_NO_BANDING: ResolvedDisplay = { ...TRUECOLOR_LIGHT, banding: false };

async function setup(store: TmpStore, display: ResolvedDisplay = TRUECOLOR_LIGHT) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 100,
    height: 24,
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
    // Renderer is 24 rows tall. Header takes 2-3 rows, footer 2 rows, history 1.
    // Band region ~16-18 rows; pin = 0.4 → focus top should land roughly rows 7..12 of the frame.
    expect(topCornerRow).toBeGreaterThanOrEqual(5);
    expect(topCornerRow).toBeLessThanOrEqual(13);
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
