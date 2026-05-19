import { describe, expect, test } from "bun:test";
import { buildRegistry } from "../../src/actions/command.ts";
import { dispatch } from "../../src/actions/dispatch.ts";
import { paletteOpen } from "../../src/actions/palette/open.ts";
import { type AppContext, createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import type { PaletteState } from "../../src/overlay/palette.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food"],
  input: { path: "x", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "x", format: "jsonl" },
};

function ctx(db: import("../../src/store/db.ts").Db): AppContext {
  return createAppContext({
    db,
    config,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
}

describe("paletteOpen command", () => {
  test("is bound to ':' in global scope and hidden from the palette", () => {
    expect(paletteOpen.bindings?.vim).toBe(":");
    expect(paletteOpen.scope).toBe("global");
    expect(paletteOpen.hidden).toBe(true);
  });

  test("running it opens a palette overlay seeded from the current registry", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = ctx(store.db);
    const registry = buildRegistry([paletteOpen]);
    app.commandRegistry = registry;
    await dispatch(registry, "review", app, "palette.open");
    expect(app.overlay?.kind).toBe("palette");
    const state = app.overlay!.state as PaletteState;
    expect(state.filter).toBe("");
    expect(state.history).toEqual([]);
  });

  test("running without commandRegistry flashes an error instead of opening empty", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = ctx(store.db);
    const registry = buildRegistry([paletteOpen]);
    // commandRegistry intentionally not set on app.
    await dispatch(registry, "review", app, "palette.open");
    expect(app.overlay).toBeNull();
    expect(app.flash?.kind).toBe("error");
    expect(app.flash?.message).toContain("registry");
  });
});

describe("paletteHistory cap", () => {
  test("pushPaletteHistory caps at 50 entries; oldest dropped", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = ctx(store.db);
    for (let i = 0; i < 60; i++) {
      app.pushPaletteHistory(`entry-${i.toString().padStart(2, "0")}`);
    }
    expect(app.paletteHistory.length).toBe(50);
    expect(app.paletteHistory[0]).toBe("entry-10");
    expect(app.paletteHistory.at(-1)).toBe("entry-59");
  });

  test("blank entries are ignored", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = ctx(store.db);
    app.pushPaletteHistory("");
    app.pushPaletteHistory("   ");
    expect(app.paletteHistory).toEqual([]);
  });
});
