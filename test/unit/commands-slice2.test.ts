import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dispatch } from "../../src/actions/dispatch.ts";
import { defaultRegistry } from "../../src/actions/registry.ts";
import { type AppContext, createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { applyEffects } from "../../src/overlay/effects.ts";
import { reduceOverlay } from "../../src/overlay/reduce.ts";
import type { Db } from "../../src/store/db.ts";
import { currentReview } from "../../src/store/queries.ts";
import { hasTag } from "../../src/store/tags.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const config: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

function makeApp(db: Db, queueId: "pending" | "skipped" = "pending"): AppContext {
  const app = createAppContext({ db, config, requestRender: () => {}, onQuit: () => {} });
  enterReview(app, queueId);
  return app;
}

describe("record.reject", () => {
  test("writes status='rejected' with prev_label = primary", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const before = app.cursor!.current()!;
    const id = before.id;
    const primary = before.primaryPrediction!.label;

    const result = await dispatch(defaultRegistry(), "review", app, "record.reject");
    expect(result.kind).toBe("ok");

    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("rejected");
    expect(cur?.final_label).toBeNull();
    expect(cur?.prev_label).toBe(primary);
  });

  test("rejected record exits pending queue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.reject");
    const remaining = store.db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM records WHERE id = ${id} AND NOT EXISTS (
        SELECT 1 FROM effective_reviews er WHERE er.record_id = records.id
      )`,
    );
    expect(remaining[0]?.n).toBe(0);
  });
});

describe("record.relabelByIndex", () => {
  test("'1' resolves to first config label; if it equals predicted, status='accepted'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    const result = await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.1");
    expect(result.kind).toBe("ok");
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("accepted");
    expect(cur?.final_label).toBe("food");
  });

  test("number for non-predicted label writes 'relabeled'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.2");
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("relabeled");
    expect(cur?.final_label).toBe("travel");
    expect(cur?.prev_label).toBe("food");
  });

  test("out-of-range index flashes error and writes nothing", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.relabelByIndex.9");
    expect(currentReview(store.db, id)).toBeNull();
    expect(app.flash?.kind).toBe("error");
  });
});

describe("record.openNote", () => {
  test("opens a note overlay for the current record with empty value when unset", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    await dispatch(defaultRegistry(), "review", app, "record.openNote");
    expect(app.overlay?.kind).toBe("note");
    if (app.overlay?.kind === "note") {
      expect(app.overlay.state.value).toBe("");
      expect(app.overlay.state.recordId).toBe(app.cursor!.current()!.id);
    }
  });

  test("prefills existing note from records.note", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    store.db.run(sql`UPDATE records SET note = 'prior note' WHERE id = ${id}`);
    app.cursor!.refresh();
    await dispatch(defaultRegistry(), "review", app, "record.openNote");
    if (app.overlay?.kind === "note") expect(app.overlay.state.value).toBe("prior note");
    else throw new Error("expected note overlay");
  });
});

describe("record.openRelabelPicker", () => {
  test("opens a picker overlay with predicted label highlighted", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    await dispatch(defaultRegistry(), "review", app, "record.openRelabelPicker");
    expect(app.overlay?.kind).toBe("picker");
    if (app.overlay?.kind === "picker") {
      const s = app.overlay.state;
      expect(s.filter).toBe("");
      expect(s.candidates.length).toBe(4);
      expect(s.candidates[s.highlight]?.label).toBe("food");
      expect(s.candidates[s.highlight]?.predicted).toBe(true);
    }
  });
});

describe("picker overlay commit via reducer + applyEffects", () => {
  test("non-predicted label writes 'relabeled' and closes overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.openRelabelPicker");
    if (app.overlay?.kind !== "picker") throw new Error("expected picker");
    // move highlight to "travel" (index 1)
    app.overlay = { kind: "picker", state: { ...app.overlay.state, highlight: 1 } };
    const result = reduceOverlay(app.overlay, { kind: "commit" });
    app.overlay = result.overlay;
    applyEffects(app, "pending", result.effects);
    expect(app.overlay).toBeNull();
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("relabeled");
    expect(cur?.final_label).toBe("travel");
  });

  test("predicted label writes 'accepted'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.openRelabelPicker");
    if (!app.overlay) throw new Error("expected overlay");
    const result = reduceOverlay(app.overlay, { kind: "commit" });
    app.overlay = result.overlay;
    applyEffects(app, "pending", result.effects);
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("accepted");
    expect(cur?.final_label).toBe("food");
  });
});

describe("note overlay commit via reducer + applyEffects", () => {
  test("writes records.note and exits overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.openNote");
    if (app.overlay?.kind !== "note") throw new Error("expected note overlay");
    app.overlay = {
      kind: "note",
      state: { ...app.overlay.state, value: "follow up later" },
    };
    const result = reduceOverlay(app.overlay, { kind: "commit" });
    app.overlay = result.overlay;
    applyEffects(app, "pending", result.effects);
    expect(app.overlay).toBeNull();
    const row = store.db.all<{ note: string | null }>(
      sql`SELECT note FROM records WHERE id = ${id}`,
    );
    expect(row[0]?.note).toBe("follow up later");
  });
});

describe("record.toggleMark", () => {
  test("toggles marked tag without writing a review", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;

    await dispatch(defaultRegistry(), "review", app, "record.toggleMark");
    expect(hasTag(store.db, id, "marked")).toBe(true);
    expect(currentReview(store.db, id)).toBeNull();

    await dispatch(defaultRegistry(), "review", app, "record.toggleMark");
    expect(hasTag(store.db, id, "marked")).toBe(false);
  });

  test("record stays in pending after toggle (orthogonal to state)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.toggleMark");
    expect(app.cursor!.current()?.id).toBe(id);
  });

  test("triggers a re-render", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    let renders = 0;
    const app = createAppContext({
      db: store.db,
      config,
      requestRender: () => {
        renders++;
      },
      onQuit: () => {},
    });
    enterReview(app, "pending");
    const before = renders;
    await dispatch(defaultRegistry(), "review", app, "record.toggleMark");
    expect(renders).toBeGreaterThan(before);
  });
});

describe("record.undo", () => {
  test("compensates the most recent review across the dataset", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.accept");
    expect(currentReview(store.db, id)?.status).toBe("accepted");
    await dispatch(defaultRegistry(), "review", app, "record.undo");
    expect(currentReview(store.db, id)).toBeNull();
  });

  test("seeks cursor to the un-done record", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.accept");
    expect(app.cursor!.current()?.id).not.toBe(id);
    await dispatch(defaultRegistry(), "review", app, "record.undo");
    expect(app.cursor!.current()?.id).toBe(id);
  });

  test("flashes 'Nothing to undo' when no review exists", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    await dispatch(defaultRegistry(), "review", app, "record.undo");
    expect(app.flash?.kind).toBe("error");
    expect(app.flash?.message).toContain("Nothing to undo");
  });

  test("second undo flashes 'Nothing to undo' instead of stacking compensations", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    const registry = defaultRegistry();
    await dispatch(registry, "review", app, "record.accept");
    await dispatch(registry, "review", app, "record.undo");
    expect(currentReview(store.db, id)).toBeNull();
    await dispatch(registry, "review", app, "record.undo");
    expect(app.flash?.kind).toBe("error");
    expect(app.flash?.message).toContain("Nothing to undo");
    const undoneRows = store.db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM reviews WHERE record_id = ${id} AND status = 'undone'`,
    );
    expect(undoneRows[0]?.n).toBe(1);
  });
});

describe("queue cycling", () => {
  test("queue.next switches cursor from pending to skipped", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    expect(app.cursor!.queueId).toBe("pending");
    await dispatch(defaultRegistry(), "review", app, "queue.next");
    expect(app.cursor!.queueId).toBe("skipped");
  });

  test("queue.next from skipped wraps back to pending", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db, "skipped");
    await dispatch(defaultRegistry(), "review", app, "queue.next");
    expect(app.cursor!.queueId).toBe("pending");
  });

  test("queue.prev cycles backwards", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    expect(app.cursor!.queueId).toBe("pending");
    await dispatch(defaultRegistry(), "review", app, "queue.prev");
    expect(app.cursor!.queueId).toBe("skipped");
  });

  test("queue.next flashes the queue label", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    await dispatch(defaultRegistry(), "review", app, "queue.next");
    expect(app.flash?.message).toContain("Skipped");
  });

  test("skip then queue-cycle reaches the skipped record", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const skippedId = app.cursor!.current()!.id;
    const registry = defaultRegistry();
    await dispatch(registry, "review", app, "record.skip");
    await dispatch(registry, "review", app, "queue.next");
    expect(app.cursor!.queueId).toBe("skipped");
    expect(app.cursor!.current()?.id).toBe(skippedId);
  });

  test("skipped cursor refreshes on each queue switch", async () => {
    // Regression: cached skipped cursor was stale when revisiting after
    // additional skips landed in pending.
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const registry = defaultRegistry();

    // Visit skipped while empty — Cursor gets cached with []
    await dispatch(registry, "review", app, "queue.next");
    expect(app.cursor!.total).toBe(0);

    // Back to pending; skip three records
    await dispatch(registry, "review", app, "queue.prev");
    expect(app.cursor!.queueId).toBe("pending");
    await dispatch(registry, "review", app, "record.skip");
    await dispatch(registry, "review", app, "record.skip");
    await dispatch(registry, "review", app, "record.skip");

    // Revisit skipped — should now show all three
    await dispatch(registry, "review", app, "queue.next");
    expect(app.cursor!.queueId).toBe("skipped");
    expect(app.cursor!.total).toBe(3);
  });
});

describe("record.accept (no prediction)", () => {
  test("flashes error and writes no review when primary prediction is null", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    store.db.run(sql`DELETE FROM predictions WHERE record_id = ${id}`);
    app.cursor!.refresh();
    await dispatch(defaultRegistry(), "review", app, "record.accept");
    expect(app.flash?.kind).toBe("error");
    expect(app.flash?.message).toContain("no prediction");
    expect(currentReview(store.db, id)).toBeNull();
  });
});

describe("record.skip", () => {
  test("writes status='skipped' and exits pending (ADR 0003)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const id = app.cursor!.current()!.id;
    await dispatch(defaultRegistry(), "review", app, "record.skip");
    expect(currentReview(store.db, id)?.status).toBe("skipped");
    expect(app.cursor!.current()?.id).not.toBe(id);
  });
});
