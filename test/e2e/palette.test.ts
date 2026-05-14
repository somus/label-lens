import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay, type ResolvedDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { displayFor } from "../util/display.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setup(store: TmpStore, display: ResolvedDisplay = defaultDisplay()) {
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

describe("palette e2e", () => {
  test("':' opens the palette and the overlay shows entries", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    expect(app.overlay?.kind).toBe("palette");
    const frame = captureCharFrame();
    expect(frame).toContain("[enter] run");
  });

  test("Esc closes the palette", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    mockInput.pressEscape();
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.overlay).toBeNull();
  });

  test("typed filter narrows entries to matching palette stems", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "by-source") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    const state = app.overlay!.state as import("../../src/overlay/palette.ts").PaletteState;
    expect(state.entries.length).toBe(1);
    expect(state.entries[0]!.commandName).toBe("palette.by-source");
  });

  test(":marked switches to the marked queue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "marked") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.queueId).toBe("marked");
  });

  test(":by-source <s> switches to a parametric queue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "by-source") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey(" ");
    await renderOnce();
    for (const ch of "llm") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.queueId).toBe("by-source:llm");
  });

  test(":queue typo flashes an unknown-queue error and closes the overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "queue") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey(" ");
    await renderOnce();
    for (const ch of "no-such-queue") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.overlay).toBeNull();
    expect(app.flash?.kind).toBe("error");
    expect(app.flash?.message).toContain("unknown queue");
  });

  test(":by-source carries colon-bearing arguments end-to-end", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "by-source") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey(" ");
    await renderOnce();
    for (const ch of "llm:gpt-4") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.queueId).toBe("by-source:llm:gpt-4");
  });

  test(":queue picker carries totalForProgress so rows render with progress bars", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "queue") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    const state = app.overlay?.state as import("../../src/overlay/palette.ts").PaletteState;
    expect(state.mode).toBe("pick");
    expect(state.picker?.pickerKind).toBe("queue");
    // tiny.jsonl has 10 records.
    expect(state.picker?.totalForProgress).toBe(10);
    expect(state.picker?.candidateCounts?.get("pending")).toBe(10);
  });

  test(":queue picker frame contains bracketed progress bar on truecolor", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(
      store,
      displayFor({ color: "truecolor" }),
    );
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "queue") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toMatch(/[█░]/);
    expect(frame).toContain("100%");
  });

  test(":help with no argument opens topic picker", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "help") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    const state = app.overlay?.state as import("../../src/overlay/palette.ts").PaletteState;
    expect(state.mode).toBe("pick");
    expect(state.picker?.pickerKind).toBe("topic");
    expect(state.picker?.candidates).toContain("tutorial");
  });
});
