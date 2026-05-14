import { describe, expect, test } from "bun:test";
import { paletteHelp } from "../../src/actions/palette/help.ts";
import { defaultRegistry } from "../../src/actions/registry.ts";
import { type AppContext, createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import type { GuidelinesState } from "../../src/overlay/guidelines.ts";
import type { HelpState } from "../../src/overlay/help.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food"],
  input: { path: "x", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "x", format: "jsonl" },
};

function makeCtx(db: import("../../src/store/db.ts").Db): AppContext {
  return createAppContext({
    db,
    config,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
}

describe("palette.help command", () => {
  test("opens a guidelines overlay with man-page content for a known topic", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = makeCtx(store.db);
    await paletteHelp.run(ctx, "keymap");
    expect(ctx.overlay?.kind).toBe("guidelines");
    const state = ctx.overlay!.state as GuidelinesState;
    expect(state.title).toBe("help: keymap");
    expect(state.content).toContain("labellens-keymap");
  });

  test("flashes an error for an unknown topic", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = makeCtx(store.db);
    await paletteHelp.run(ctx, "no-such-thing");
    expect(ctx.flash?.kind).toBe("error");
    expect(ctx.flash?.message).toContain("unknown help topic");
    expect(ctx.overlay).toBeNull();
  });

  test("with no argument, opens the same contextual help overlay as '?'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = makeCtx(store.db);
    ctx.commandRegistry = defaultRegistry();
    ctx.activeScope = "review";
    await paletteHelp.run(ctx);
    expect(ctx.overlay?.kind).toBe("help");
    const state = ctx.overlay!.state as HelpState;
    expect(state.scope).toBe("review");
  });
});
