import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay, type ResolvedDisplay } from "../../src/render/capability.ts";
import { mountQueueScreen } from "../../src/screens/queue.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { mountStatsScreen } from "../../src/screens/stats.ts";
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
  const reviewHandle = mountReviewScreen({ renderer, app });
  await renderOnce();
  return { app, renderer, reviewHandle, mockInput, renderOnce, captureCharFrame };
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

  test(":queue with no argument opens the same Queue screen path as Shift+Q", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    let opened = 0;
    app.openQueueScreen = () => {
      opened += 1;
    };
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "queue") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(opened).toBe(1);
    expect(app.overlay).toBeNull();
  });

  test(":queue opens the Queue screen instead of repainting review after palette close", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, renderer, reviewHandle, mockInput, renderOnce, captureCharFrame } =
      await setup(store);
    app.openQueueScreen = () => {
      reviewHandle.destroy();
      mountQueueScreen({
        renderer,
        app,
        onSelect: () => {},
        onCancel: () => {},
      });
    };

    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "queue") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();

    expect(app.activeScope).toBe("queue");
    expect(captureCharFrame()).toContain("Queues");
  });

  test(":stats opens the same Stats screen path as t", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store, displayFor({ color: "truecolor" }));
    let opened = 0;
    app.openStatsScreen = () => {
      opened += 1;
    };
    mockInput.pressKey("t");
    await renderOnce();
    expect(opened).toBe(1);

    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "stats") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(opened).toBe(2);
    expect(app.overlay).toBeNull();
  });

  test(":stats opens the Stats screen instead of repainting review after palette close", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, renderer, reviewHandle, mockInput, renderOnce, captureCharFrame } =
      await setup(store);
    app.openStatsScreen = () => {
      reviewHandle.destroy();
      mountStatsScreen({
        renderer,
        app,
        onDrill: () => {},
        onCancel: () => {},
      });
    };

    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "stats") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();

    expect(app.activeScope).toBe("stats");
    expect(captureCharFrame()).toContain("Stats");
  });

  test(":where with no argument opens the visual filter builder and previews results", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "where") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await renderOnce();
    expect(app.overlay?.kind).toBe("filter-builder");
    await new Promise((r) => setTimeout(r, 240));
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Visual where filter");
    expect(frame).toContain("Results:");
    expect(frame).toContain("records");
    expect(frame).toContain("source");
    expect(frame).toContain("Available columns");
    expect(frame).toContain("final_label");
    expect(frame).toContain("issue_type");
  });

  test(":where builder shows options for the active chip below the filter rows", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "where") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await renderOnce();

    mockInput.pressArrow("right");
    await renderOnce();
    let frame = captureCharFrame();
    expect(frame).toContain("Available operators for source");
    expect(frame).toContain("!=");
    expect(frame).toContain("in");

    mockInput.pressArrow("right");
    await renderOnce();
    frame = captureCharFrame();
    expect(frame).toContain("Available values for source");
    expect(frame).toContain("llm:gpt-4");
    expect(frame).toContain("regex.simple");
  });

  test(":where builder keeps the highlighted option visible in long lists", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "where") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await renderOnce();
    mockInput.pressArrow("right");
    await renderOnce();
    mockInput.pressArrow("right");
    await renderOnce();

    if (app.overlay?.kind !== "filter-builder") throw new Error("expected filter builder");
    app.overlay.state = {
      ...app.overlay.state,
      valueOptions: {
        ...app.overlay.state.valueOptions,
        source: Array.from({ length: 12 }, (_, i) => `src-${i}`),
      },
      rows: [
        {
          ...app.overlay.state.rows[0]!,
          value: "src-0",
          valueCursor: 0,
        },
      ],
    };
    for (let i = 0; i < 10; i++) {
      mockInput.pressArrow("down");
      await renderOnce();
    }

    const frame = captureCharFrame();
    expect(frame).toContain("src-10");
    expect(frame).toContain("above");
  });

  test(":where builder supports multi-select values for the in operator", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "where") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await renderOnce();

    mockInput.pressArrow("right");
    await renderOnce();
    mockInput.pressArrow("down");
    await renderOnce();
    mockInput.pressArrow("down");
    await renderOnce();
    mockInput.pressArrow("right");
    await renderOnce();
    let frame = captureCharFrame();
    expect(frame).toContain("┌ in ┐");
    expect(frame).toContain("[x]");
    expect(frame).toContain("llm:gpt-4");
    expect(frame).toContain("regex.simple");

    mockInput.pressArrow("down");
    await renderOnce();
    mockInput.pressKey(" ");
    await renderOnce();
    frame = captureCharFrame();
    expect(frame).toContain("[x]");
    expect(app.overlay?.kind).toBe("filter-builder");
    if (app.overlay?.kind === "filter-builder") {
      expect(app.overlay.state.rows[0]!.values).toEqual(["llm:gpt-4", "regex.simple"]);
    }
  });

  test(":where builder a/o creates a joined row with a visible connector", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "where") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await renderOnce();

    mockInput.pressKey("o");
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("OR");
    expect(app.overlay?.kind).toBe("filter-builder");
    if (app.overlay?.kind === "filter-builder") {
      expect(app.overlay.state.rows).toHaveLength(2);
      expect(app.overlay.state.rows[1]!.join).toBe("or");
    }
  });

  test(":where visual builder commit switches to a where queue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "where") {
      mockInput.pressKey(ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await renderOnce();
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.overlay).toBeNull();
    expect(app.queueId).toMatch(/^where:source = '/);
  });

  test(":where with an argument still runs the raw where expression", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "where source = 'llm'") {
      mockInput.pressKey(ch === " " ? " " : ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.overlay).toBeNull();
    expect(app.queueId).toBe("where:source = 'llm'");
  });

  test(":help with no argument opens contextual help", async () => {
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
    expect(app.overlay?.kind).toBe("help");
    if (app.overlay?.kind === "help") expect(app.overlay.state.scope).toBe("review");
  });

  test(":help topics opens the help topic picker", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey(":");
    await renderOnce();
    for (const ch of "help topics") {
      mockInput.pressKey(ch === " " ? " " : ch);
      await renderOnce();
    }
    mockInput.pressKey("RETURN");
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.overlay?.kind).toBe("palette");
    if (app.overlay?.kind === "palette") {
      expect(app.overlay.state.mode).toBe("pick");
      expect(app.overlay.state.picker?.pickerKind).toBe("topic");
      expect(app.overlay.state.picker?.candidates).toContain("tutorial");
    }
  });
});
