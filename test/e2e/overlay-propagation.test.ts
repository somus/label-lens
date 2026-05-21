import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { sql } from "drizzle-orm";
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

function reviewCount(ctx: Awaited<ReturnType<typeof setup>>): number {
  return ctx.store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM reviews`)[0]!.n;
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

  test("read-only overlays do not propagate review decision keys", async () => {
    const stats = await setup();
    using _statsStore = stats.store;
    stats.mockInput.pressKey("t");
    await stats.renderOnce();
    stats.mockInput.pressKey("a");
    await stats.renderOnce();
    expect(stats.app.overlay?.kind).toBe("stats");
    expect(reviewCount(stats)).toBe(0);

    const help = await setup();
    using _helpStore = help.store;
    help.mockInput.pressKey("?");
    await help.renderOnce();
    help.mockInput.pressKey("a");
    await help.renderOnce();
    expect(help.app.overlay?.kind).toBe("help");
    expect(reviewCount(help)).toBe(0);

    const guidelines = await setup();
    using _guidelinesStore = guidelines.store;
    guidelines.mockInput.pressKey("g");
    await guidelines.renderOnce();
    guidelines.mockInput.pressKey("g");
    await guidelines.renderOnce();
    guidelines.mockInput.pressKey("a");
    await guidelines.renderOnce();
    expect(guidelines.app.overlay?.kind).toBe("guidelines");
    expect(reviewCount(guidelines)).toBe(0);

    const queue = await setup();
    using _queueStore = queue.store;
    queue.mockInput.pressKey("Q", { shift: true });
    await queue.renderOnce();
    queue.mockInput.pressKey("a");
    await queue.renderOnce();
    expect(queue.app.overlay?.kind).toBe("queue");
    expect(reviewCount(queue)).toBe(0);
  });

  test("inline assistant overlay propagates review-scope decisions and openers", async () => {
    // ADR 0009 puts the assistant beneath the chip rail, not in a modal
    // stack, so reviewers expect the full review keymap to keep working.
    // Open the assistant manually (no provider call needed for this
    // test); we just need overlay.kind === "assistant" so the dispatcher
    // takes the special-case branch.
    const ctx = await setup();
    using _store = ctx.store;
    ctx.app.overlay = {
      kind: "assistant",
      state: {
        recordId: ctx.app.cursor!.current()!.id,
        predictedLabel: "food",
        reasoningExpanded: false,
        status: "loading",
      },
    };
    ctx.mockInput.pressKey("a");
    await ctx.renderOnce();
    expect(reviewCount(ctx)).toBe(1);
  });
});
