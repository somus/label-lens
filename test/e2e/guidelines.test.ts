import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

function makeConfig(guidelines?: string): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel"],
    guidelines,
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setup(store: TmpStore, config: LabellensConfig) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 120,
    height: 40,
  });
  const app = createAppContext({
    db: store.db,
    config,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app });
  await renderOnce();
  return { app, mockInput, renderOnce, captureCharFrame };
}

describe("guidelines e2e", () => {
  test("`g g` chord opens the guidelines overlay with inline content", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store, makeConfig("# Inline\n\n- rule one"));
    mockInput.pressKey("g");
    await renderOnce();
    mockInput.pressKey("g");
    await renderOnce();
    expect(app.overlay?.kind).toBe("guidelines");
  });

  test("missing config field shows the placeholder", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store, makeConfig());
    mockInput.pressKey("g");
    await renderOnce();
    mockInput.pressKey("g");
    await renderOnce();
    expect(app.overlay?.kind).toBe("guidelines");
    const state = app.overlay!.state as import("../../src/overlay/guidelines.ts").GuidelinesState;
    expect(state.source).toBe("missing");
  });

  test("`g d` does not open guidelines (chord regression)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store, makeConfig("# x"));
    mockInput.pressKey("g");
    await renderOnce();
    mockInput.pressKey("d");
    await renderOnce();
    // Without a boundary task `g d` is disabled but it still must not collide
    // with `g g` and open the guidelines overlay.
    expect(app.overlay?.kind).not.toBe("guidelines");
  });

  test("Esc closes the guidelines overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store, makeConfig("# x"));
    mockInput.pressKey("g");
    await renderOnce();
    mockInput.pressKey("g");
    await renderOnce();
    mockInput.pressEscape();
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.overlay).toBeNull();
  });
});
