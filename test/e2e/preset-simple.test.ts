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
  const { renderer, mockInput, renderOnce } = await createTestRenderer({
    width: 100,
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
  return { store, app, mockInput, renderOnce };
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
});
