import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import type { HelpState } from "../../src/overlay/help.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore, type TmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setup(store: TmpStore) {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 120,
    height: 40,
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

describe("help e2e", () => {
  test("'?' opens the help overlay scoped to review", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce, captureCharFrame } = await setup(store);
    mockInput.pressKey("?");
    await renderOnce();
    expect(app.overlay?.kind).toBe("help");
    const state = app.overlay!.state as HelpState;
    expect(state.scope).toBe("review");
    const frame = captureCharFrame();
    expect(frame).toContain("help");
  });

  test("hidden commands like palette.open are not listed", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey("?");
    await renderOnce();
    const state = app.overlay!.state as HelpState;
    expect(state.entries.some((e) => e.name === "palette.open")).toBe(false);
  });

  test("Esc closes the help overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const { app, mockInput, renderOnce } = await setup(store);
    mockInput.pressKey("?");
    await renderOnce();
    mockInput.pressEscape();
    await new Promise((r) => setTimeout(r, 30));
    await renderOnce();
    expect(app.overlay).toBeNull();
  });
});
