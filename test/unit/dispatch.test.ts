import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { buildRegistry, type Command } from "../../src/actions/command.ts";
import { dispatch } from "../../src/actions/dispatch.ts";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import type { FieldMap } from "../../src/config/inference.ts";
import { ingestFile } from "../../src/ingest/ingest.ts";
import { applySchema } from "../../src/store/schema.ts";

const FIELDS: FieldMap = {
  text: "text",
  prediction: "prediction",
  confidence: "confidence",
  source: "source",
  context_before: "context_before",
  context_after: "context_after",
};

const config: LabellensConfig = {
  task: "classification",
  labels: ["food"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

async function setup() {
  const db = new Database(":memory:");
  applySchema(db);
  await ingestFile(db, "test/fixtures/tiny.jsonl", FIELDS);
  const ctx = createAppContext({
    db,
    config,
    requestRender: () => {},
    onQuit: () => {},
  });
  return { db, ctx };
}

describe("dispatch", () => {
  test("runs an action that matches the scope", async () => {
    const { ctx } = await setup();
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
    const { ctx } = await setup();
    const cmd: Command = {
      name: "stats.only",
      scope: "stats",
      run: () => {},
    };
    const registry = buildRegistry([cmd]);
    const result = await dispatch(registry, "review", ctx, "stats.only");
    expect(result.kind).toBe("scope-mismatch");
  });

  test("global commands run from any scope", async () => {
    const { ctx } = await setup();
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
    const { ctx } = await setup();
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
    const { ctx } = await setup();
    const result = await dispatch(buildRegistry([]), "review", ctx, "nope");
    expect(result.kind).toBe("unknown");
  });

  test("catches throws and flashes error", async () => {
    const { ctx } = await setup();
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
    const { ctx } = await setup();
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
