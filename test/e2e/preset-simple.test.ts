import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { buildRegistry } from "../../src/actions/command.ts";
import { ALL_COMMANDS } from "../../src/actions/registry.ts";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { resolvePreset } from "../../src/keymap/preset.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

function simpleConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
    keys: { preset: "simple" },
  };
}

async function setup() {
  const store = await openTmpStore({ ingest: "tiny.jsonl" });
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 140,
    height: 24,
  });
  const config = simpleConfig();
  const { commands, errors } = resolvePreset(ALL_COMMANDS, config.keys);
  expect(errors).toEqual([]);
  const registry = buildRegistry(commands);
  const app = createAppContext({
    db: store.db,
    config,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  mountReviewScreen({ renderer, app, registry });
  await renderOnce();
  return { store, app, mockInput, renderOnce, captureCharFrame };
}

describe("simple preset end-to-end through review screen", () => {
  test("'↓' advances the record cursor", async () => {
    const { app, mockInput, renderOnce } = await setup();
    const before = app.cursor?.current()?.id;
    mockInput.pressArrow("down");
    await renderOnce();
    expect(app.cursor?.current()?.id).not.toBe(before);
  });

  test("'j' is inert under simple preset — cursor does not move", async () => {
    const { app, mockInput, renderOnce } = await setup();
    const before = app.cursor?.current()?.id;
    mockInput.pressKey("j");
    await renderOnce();
    expect(app.cursor?.current()?.id).toBe(before);
  });

  test("'→' cycles to the next queue under simple preset", async () => {
    const { app, mockInput, renderOnce } = await setup();
    expect(app.queueId).toBe("pending");
    mockInput.pressArrow("right");
    await renderOnce();
    expect(app.queueId).not.toBe("pending");
  });

  test("'[' is inert under simple preset — queue does not cycle", async () => {
    const { app, mockInput, renderOnce } = await setup();
    expect(app.queueId).toBe("pending");
    mockInput.pressKey("[");
    await renderOnce();
    expect(app.queueId).toBe("pending");
  });

  test("'ctrl+p' opens the palette under simple preset", async () => {
    const { app, mockInput, renderOnce } = await setup();
    expect(app.overlay).toBeNull();
    mockInput.pressKey("p", { ctrl: true });
    await renderOnce();
    expect(app.overlay?.kind).toBe("palette");
  });

  test("action footer renders the arrow nav cluster and queue cycle suffix under simple", async () => {
    const { captureCharFrame } = await setup();
    const frame = captureCharFrame();
    // Combined nav cluster: record.next + record.prev → `[↓/↑] nav`.
    expect(frame).toContain("[↓/↑] nav");
    // Queue cycle suffix: queue.prev + queue.next → `queues ←/→`.
    expect(frame).toContain("queues ←/→");
    // Palette uses ctrl+p under simple → `[^p] palette`.
    expect(frame).toContain("[^p] palette");
    // Vim-only j/k aliases are gone from the footer.
    expect(frame).not.toContain("[j/k] nav");
    expect(frame).not.toContain("queues [/]");
  });
});
