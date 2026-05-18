import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

async function setup() {
  const store = await openTmpStore({ ingest: "tiny.jsonl" });
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
  return { store, app, mockInput, renderOnce, captureCharFrame };
}

describe("overlay propagation e2e", () => {
  test("stats overlay propagates ':' to replace itself with the palette", async () => {
    const ctx = await setup();
    using _store = ctx.store;

    ctx.mockInput.pressKey("t");
    await ctx.renderOnce();
    expect(ctx.app.overlay?.kind).toBe("stats");

    ctx.mockInput.pressKey(":");
    await ctx.renderOnce();

    expect(ctx.app.overlay?.kind).toBe("palette");
  });

  test("stats overlay propagates '?' to replace itself with contextual help", async () => {
    const ctx = await setup();
    using _store = ctx.store;

    ctx.mockInput.pressKey("t");
    await ctx.renderOnce();
    expect(ctx.app.overlay?.kind).toBe("stats");

    ctx.mockInput.pressKey("?");
    await ctx.renderOnce();

    expect(ctx.app.overlay?.kind).toBe("help");
    const frame = ctx.captureCharFrame();
    expect(frame).toContain("Help · stats");
    expect(frame).toContain("j/k");
    expect(frame).toContain("enter");
    expect(frame).toContain("esc");
    expect(frame).toContain("stats.controls");
  });

  test("guidelines overlay propagates '?' to contextual help", async () => {
    const ctx = await setup();
    using _store = ctx.store;

    ctx.mockInput.pressKey("g");
    await ctx.renderOnce();
    ctx.mockInput.pressKey("g");
    await ctx.renderOnce();
    expect(ctx.app.overlay?.kind).toBe("guidelines");

    ctx.mockInput.pressKey("?");
    await ctx.renderOnce();

    expect(ctx.app.overlay?.kind).toBe("help");
  });

  test("help overlay propagates ':' to the palette", async () => {
    const ctx = await setup();
    using _store = ctx.store;

    ctx.mockInput.pressKey("?");
    await ctx.renderOnce();
    expect(ctx.app.overlay?.kind).toBe("help");

    ctx.mockInput.pressKey(":");
    await ctx.renderOnce();

    expect(ctx.app.overlay?.kind).toBe("palette");
  });
});
