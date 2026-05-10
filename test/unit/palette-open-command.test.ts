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
    expect(paletteOpen.binding).toBe(":");
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
});
