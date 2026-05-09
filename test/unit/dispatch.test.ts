import { describe, expect, test } from "bun:test";
import { buildRegistry, type Command } from "../../src/actions/command.ts";
import { dispatch } from "../../src/actions/dispatch.ts";
import { type AppContext, createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import type { Db } from "../../src/store/db.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

function makeCtx(db: Db): AppContext {
  return createAppContext({
    db,
    config,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
}

describe("dispatch", () => {
  test("runs an action that matches the scope", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = makeCtx(store.db);
    let ran = false;
    const cmd: Command = {
      name: "test.run",
      scope: "review",
      run: () => {
        ran = true;
      },
    };
    const registry = buildRegistry([cmd]);
    const result = await dispatch(registry, "review", ctx, "test.run");
    expect(result.kind).toBe("ok");
    expect(ran).toBe(true);
  });

  test("returns scope-mismatch when scope differs", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = makeCtx(store.db);
    const cmd: Command = { name: "stats.only", scope: "stats", run: () => {} };
    const registry = buildRegistry([cmd]);
    const result = await dispatch(registry, "review", ctx, "stats.only");
    expect(result.kind).toBe("scope-mismatch");
  });

  test("global commands run from any scope", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = makeCtx(store.db);
    let ran = false;
    const cmd: Command = {
      name: "app.escape",
      scope: "global",
      run: () => {
        ran = true;
      },
    };
    const registry = buildRegistry([cmd]);
    const result = await dispatch(registry, "stats", ctx, "app.escape");
    expect(result.kind).toBe("ok");
    expect(ran).toBe(true);
  });

  test("respects enabled gate", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = makeCtx(store.db);
    const cmd: Command = {
      name: "blocked",
      scope: "review",
      enabled: () => false,
      run: () => {},
    };
    const registry = buildRegistry([cmd]);
    const result = await dispatch(registry, "review", ctx, "blocked");
    expect(result.kind).toBe("disabled");
  });

  test("returns unknown for missing actions", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = makeCtx(store.db);
    const result = await dispatch(buildRegistry([]), "review", ctx, "nope");
    expect(result.kind).toBe("unknown");
  });

  test("catches throws and flashes error", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = makeCtx(store.db);
    const cmd: Command = {
      name: "boom",
      scope: "review",
      run: () => {
        throw new Error("expected boom");
      },
    };
    const registry = buildRegistry([cmd]);
    const result = await dispatch(registry, "review", ctx, "boom");
    expect(result.kind).toBe("error");
    expect(ctx.flash?.kind).toBe("error");
    expect(ctx.flash?.message).toContain("boom");
    expect(ctx.flash?.message).toContain("expected boom");
  });

  test("awaits async run", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const ctx = makeCtx(store.db);
    let resolved = false;
    const cmd: Command = {
      name: "delayed",
      scope: "review",
      run: async () => {
        await new Promise((r) => setTimeout(r, 5));
        resolved = true;
      },
    };
    const registry = buildRegistry([cmd]);
    const result = await dispatch(registry, "review", ctx, "delayed");
    expect(result.kind).toBe("ok");
    expect(resolved).toBe(true);
  });
});
