import { describe, expect, test } from "bun:test";
import { dispatch } from "../../src/actions/dispatch.ts";
import { defaultRegistry } from "../../src/actions/registry.ts";
import { type AppContext, createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { applyEffects } from "../../src/overlay/effects.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import type { Db } from "../../src/store/db.ts";
import { currentReview } from "../../src/store/queries.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

function makeApp(db: Db): AppContext {
  const app = createAppContext({
    db,
    config,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  enterReview(app, "pending");
  return app;
}

describe("source_of_truth audit tag (ADR 0004)", () => {
  test("accept without viewing assistant → source_of_truth = 'human'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.accept");
    expect(currentReview(store.db, id)?.source_of_truth).toBe("human");
  });

  test("markAssistantViewed then accept → source_of_truth = 'human+assistant'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    applyEffects(app, app.queueId!, [{ kind: "markAssistantViewed", recordId: id }]);
    await dispatch(defaultRegistry(), "review", app, "record.accept");
    expect(currentReview(store.db, id)?.source_of_truth).toBe("human+assistant");
  });

  test("viewing on rec-1 doesn't leak to rec-2 (cleared by record.next)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const rec1 = app.cursor!.current()!.id;
    applyEffects(app, app.queueId!, [{ kind: "markAssistantViewed", recordId: rec1 }]);
    await dispatch(defaultRegistry(), "review", app, "record.next");
    const rec2 = app.cursor!.current()!.id;
    expect(rec2).not.toBe(rec1);
    await dispatch(defaultRegistry(), "review", app, "record.accept");
    expect(currentReview(store.db, rec2)?.source_of_truth).toBe("human");
  });

  test("relabelByIndex also picks up the viewed tag", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    applyEffects(app, app.queueId!, [{ kind: "markAssistantViewed", recordId: id }]);
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.2");
    expect(currentReview(store.db, id)?.source_of_truth).toBe("human+assistant");
  });

  test("clearViewedAssistant directly drops the set", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    app.viewedAssistant.add(id);
    expect(app.viewedAssistant.size).toBe(1);
    app.clearViewedAssistant();
    expect(app.viewedAssistant.size).toBe(0);
  });

  test("queue.switch clears viewedAssistant (no cross-queue leak)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    applyEffects(app, app.queueId!, [{ kind: "markAssistantViewed", recordId: id }]);
    expect(app.viewedAssistant.has(id)).toBe(true);
    await dispatch(defaultRegistry(), "review", app, "queue.switch.skipped");
    expect(app.viewedAssistant.size).toBe(0);
  });

  test("queue.next ([/]) clears viewedAssistant (no cross-queue leak)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    applyEffects(app, app.queueId!, [{ kind: "markAssistantViewed", recordId: id }]);
    expect(app.viewedAssistant.has(id)).toBe(true);
    await dispatch(defaultRegistry(), "review", app, "queue.next");
    expect(app.viewedAssistant.size).toBe(0);
  });
});
