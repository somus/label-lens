import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";

import { displayFor } from "../util/display.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "utility", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setup(store: TmpStore, display = defaultDisplay()) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 120,
    height: 40,
  });
  const app = createAppContext({
    db: store.db,
    config: makeConfig(),
    display,
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();
  return { app, mockInput, renderOnce, captureCharFrame };
}

describe("palette centered modal", () => {
  test("renders category headers (Queues, Filters, Help)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Queues");
    expect(frame).toContain("Filters");
    expect(frame).toContain("Help");
  });

  test("shows inline counts for queue entries", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    const frame = captureCharFrame();
    // marked queue should show count 0 (no marks in tiny.jsonl)
    expect(frame).toContain("marked");
    expect(frame).toContain("0");
  });

  test("shows descriptions for filter entries", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Filter by source");
    expect(frame).toContain("Filter by label");
    expect(frame).toContain("Filter by issue type");
  });

  test("first entry is highlighted with '>' marker", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    const state = app.overlay?.state as import("../../src/overlay/palette.ts").PaletteState;
    expect(state.highlight).toBe(0);
    expect(state.entries[0]!.palette).toBe(":queue");
  });

  test("modal is centered (has margin on both sides)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    const frame = captureCharFrame();
    const lines = frame.split("\n");
    // Find the top border of the modal
    const modalLine = lines.find((l) => l.includes("┌") && l.includes("┐"));
    expect(modalLine).toBeDefined();
    // Modal should have leading whitespace (centered)
    expect(modalLine!.trimStart()).not.toBe(modalLine);
    // And trailing whitespace
    expect(modalLine!.trimEnd()).not.toBe(modalLine);
  });

  test("mono display renders without color (bold highlight instead)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(
      store,
      displayFor({ color: "mono" }),
    );
    mockInput.pressKey(":");
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Queues");
    expect(frame).toContain("Filters");
    expect(frame).toContain("[enter] run");
  });

  test("selecting by-source opens inline picker with real sources", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    // Navigate to by-source and press enter
    for (const ch of "by-source") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await renderOnce();

    const state = app.overlay?.state as import("../../src/overlay/palette.ts").PaletteState;
    expect(state.mode).toBe("pick");
    expect(state.picker).not.toBeNull();
    expect(state.picker!.pickerKind).toBe("source");

    const frame = captureCharFrame();
    expect(frame).toContain("by-source >");
    // tiny.jsonl has "llm" as a source
    expect(frame).toContain("llm");
  });

  test("picker esc returns to browse mode", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "by-source") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await renderOnce();
    expect((app.overlay?.state as import("../../src/overlay/palette.ts").PaletteState).mode).toBe(
      "pick",
    );

    mockInput.pressEscape();
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    const state = app.overlay?.state as import("../../src/overlay/palette.ts").PaletteState;
    expect(state.mode).toBe("browse");
    expect(state.picker).toBeNull();
  });

  test("picker enter selects candidate and switches queue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "by-source") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await renderOnce();
    // Select first source candidate
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();

    expect(app.overlay).toBeNull();
    expect(app.queueId).toMatch(/^by-source:/);
  });
});
