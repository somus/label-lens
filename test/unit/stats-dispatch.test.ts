import { describe, expect, test } from "bun:test";
import { dispatch } from "../../src/actions/dispatch.ts";
import { defaultRegistry } from "../../src/actions/registry.ts";
import { paletteStats, statsShow } from "../../src/actions/stats/show.ts";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

function makeConfig(): LabellensConfig {
  return {
    task: "classification",
    labels: ["food", "travel", "other"],
    input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
    output: { path: "/tmp/out.jsonl", format: "jsonl" },
  };
}

describe("stats command + palette wiring", () => {
  test("stats.show is registered with binding 't' in review scope", () => {
    const reg = defaultRegistry();
    const cmd = reg.get("stats.show");
    expect(cmd?.name).toBe(statsShow.name);
    expect(cmd?.scope).toBe("review");
    expect(cmd?.binding).toBe("t");
  });

  test("palette.stats is registered with palette label ':stats' in global scope", () => {
    const reg = defaultRegistry();
    const cmd = reg.get("palette.stats");
    expect(cmd).toBe(paletteStats);
    expect(cmd?.scope).toBe("global");
    expect(cmd?.palette).toBe(":stats");
  });

  test("stats.show opens stats overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = createAppContext({
      db: store.db,
      config: makeConfig(),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    const result = await dispatch(defaultRegistry(), "review", app, "stats.show");
    expect(result).toEqual({ kind: "ok", action: "stats.show" });
    expect(app.overlay?.kind).toBe("stats");
  });

  test("stats.show and palette.stats both open the stats overlay directly", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = createAppContext({
      db: store.db,
      config: makeConfig(),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });

    await dispatch(defaultRegistry(), "review", app, "stats.show");
    expect(app.overlay?.kind).toBe("stats");
    app.closeOverlay();
    await dispatch(defaultRegistry(), "review", app, "palette.stats");

    expect(app.overlay?.kind).toBe("stats");
  });

  test("palette.stats opens stats overlay in any scope (global)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = createAppContext({
      db: store.db,
      config: makeConfig(),
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    const r1 = await dispatch(defaultRegistry(), "review", app, "palette.stats");
    expect(r1.kind).toBe("ok");
    expect(app.overlay?.kind).toBe("stats");
    app.closeOverlay();
    const r2 = await dispatch(defaultRegistry(), "queue", app, "palette.stats");
    expect(r2.kind).toBe("ok");
    expect(app.overlay?.kind).toBe("stats");
  });
});
