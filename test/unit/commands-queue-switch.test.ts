import { describe, expect, test } from "bun:test";
import { dispatch } from "../../src/actions/dispatch.ts";
import { switchQueue } from "../../src/actions/queue/switch.ts";
import { defaultRegistry } from "../../src/actions/registry.ts";
import { type AppContext, createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import type { Db } from "../../src/store/db.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

function makeApp(db: Db): AppContext {
  return enterReview(
    createAppContext({
      db,
      config,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    }),
  );
}

describe("queue.switch commands", () => {
  test("queue.switch.skipped sets active cursor + queue + flash", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    expect(app.queueId).toBe("pending");
    const result = await dispatch(defaultRegistry(), "review", app, "queue.switch.skipped");
    expect(result.kind).toBe("ok");
    expect(app.queueId).toBe("skipped");
    expect(app.cursor!.queueId).toBe("skipped");
    expect(app.flash?.message).toContain("Skipped");
  });

  test("queue.switch.low-confidence works through dispatch", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    await dispatch(defaultRegistry(), "review", app, "queue.switch.low-confidence");
    expect(app.queueId).toBe("low-confidence");
  });

  test("queue.switch.marked stays dispatchable without adding a duplicate palette row", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const registry = defaultRegistry();
    const result = await dispatch(registry, "review", app, "queue.switch.marked");
    expect(result.kind).toBe("ok");
    expect(app.queueId).toBe("marked");
    expect(registry.get("queue.switch.marked")?.palette).toBeUndefined();
  });

  test("switchQueue() reuses cached cursors", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    switchQueue(app, "low-confidence");
    const first = app.cursor;
    switchQueue(app, "skipped");
    switchQueue(app, "low-confidence");
    expect(app.cursor).toBe(first!);
  });

  test("switchQueue() handles parameterized ids (palette path)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    switchQueue(app, "by-source:llm:gpt-4");
    expect(app.queueId).toBe("by-source:llm:gpt-4");
    expect(app.cursor!.queueId).toBe("by-source:llm:gpt-4");
  });

  test("queue.openScreen and bare palette.queue both open the queue overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);

    await dispatch(defaultRegistry(), "review", app, "queue.openScreen");
    expect(app.overlay?.kind).toBe("queue");
    app.closeOverlay();

    await dispatch(defaultRegistry(), "review", app, "palette.queue");
    expect(app.overlay?.kind).toBe("queue");
  });

  test("palette.queue with an argument still switches directly", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    await dispatch(defaultRegistry(), "review", app, "palette.queue", "low-confidence");
    expect(app.queueId).toBe("low-confidence");
  });
});
