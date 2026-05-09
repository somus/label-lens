import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dispatch } from "../../src/actions/dispatch.ts";
import { defaultRegistry } from "../../src/actions/registry.ts";
import { type AppContext, createAppContext, reviewContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
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

function makeApp(db: Db): AppContext {
  return createAppContext({ db, config, requestRender: () => {}, onQuit: () => {} });
}

describe("record.reject", () => {
  test("writes status='rejected' with prev_label = primary", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const before = ctx.cursor.current()!;
    const id = before.id;
    const primary = before.primaryPrediction!.label;

    const result = await dispatch(defaultRegistry(), "review", ctx, "record.reject");
    expect(result.kind).toBe("ok");

    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("rejected");
    expect(cur?.final_label).toBeNull();
    expect(cur?.prev_label).toBe(primary);
  });

  test("rejected record exits pending queue", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;
    await dispatch(defaultRegistry(), "review", ctx, "record.reject");
    const remaining = store.db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM records WHERE id = ${id} AND NOT EXISTS (
        SELECT 1 FROM reviews v WHERE v.record_id = records.id AND v.status != 'undone'
      )`,
    );
    expect(remaining[0]?.n).toBe(0);
  });
});

describe("record.relabelByIndex", () => {
  test("'1' resolves to first config label; if it equals predicted, status='accepted'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;
    const result = await dispatch(defaultRegistry(), "review", ctx, "record.relabelByIndex.1");
    expect(result.kind).toBe("ok");
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("accepted");
    expect(cur?.final_label).toBe("food");
  });

  test("number for non-predicted label writes 'relabeled'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;
    await dispatch(defaultRegistry(), "review", ctx, "record.relabelByIndex.2");
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("relabeled");
    expect(cur?.final_label).toBe("travel");
    expect(cur?.prev_label).toBe("food");
  });

  test("out-of-range index flashes error and writes nothing", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;
    await dispatch(defaultRegistry(), "review", ctx, "record.relabelByIndex.9");
    expect(currentReview(store.db, id)).toBeNull();
    expect(app.flash?.kind).toBe("error");
  });
});

describe("record.openNote", () => {
  test("enters note mode for the current record with empty value when unset", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    await dispatch(defaultRegistry(), "review", ctx, "record.openNote");
    expect(app.mode).toBe("note");
    expect(app.notePrompt?.value).toBe("");
    expect(app.notePrompt?.recordId).toBe(ctx.cursor.current()!.id);
  });

  test("prefills existing note from records.note", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;
    store.db.run(sql`UPDATE records SET note = 'prior note' WHERE id = ${id}`);
    ctx.cursor.refresh();
    await dispatch(defaultRegistry(), "review", ctx, "record.openNote");
    expect(app.notePrompt?.value).toBe("prior note");
  });
});

describe("record.openRelabelPicker", () => {
  test("enters picker mode with predicted label highlighted", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    await dispatch(defaultRegistry(), "review", ctx, "record.openRelabelPicker");
    expect(app.mode).toBe("picker");
    expect(app.picker?.filter).toBe("");
    expect(app.picker?.candidates.length).toBe(4);
    expect(app.picker?.candidates[app.picker.highlight]?.label).toBe("food");
    expect(app.picker?.candidates[app.picker.highlight]?.predicted).toBe(true);
  });
});

describe("commitPickerSelection", () => {
  test("non-predicted label writes 'relabeled' and closes picker", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;
    await dispatch(defaultRegistry(), "review", ctx, "record.openRelabelPicker");
    // move highlight to "travel" (index 1)
    app.picker!.highlight = 1;
    const { commitPickerSelection } = await import("../../src/actions/record/commit-picker.ts");
    commitPickerSelection(ctx);
    expect(app.mode).toBe("review");
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("relabeled");
    expect(cur?.final_label).toBe("travel");
  });

  test("predicted label writes 'accepted'", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;
    await dispatch(defaultRegistry(), "review", ctx, "record.openRelabelPicker");
    const { commitPickerSelection } = await import("../../src/actions/record/commit-picker.ts");
    commitPickerSelection(ctx);
    const cur = currentReview(store.db, id);
    expect(cur?.status).toBe("accepted");
    expect(cur?.final_label).toBe("food");
  });
});

describe("commitNote", () => {
  test("writes records.note and exits overlay", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;
    await dispatch(defaultRegistry(), "review", ctx, "record.openNote");
    app.notePrompt!.value = "follow up later";
    const { commitNote } = await import("../../src/actions/record/commit-note.ts");
    commitNote(ctx);
    expect(app.mode).toBe("review");
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
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;

    await dispatch(defaultRegistry(), "review", ctx, "record.toggleMark");
    expect(hasTag(store.db, id, "marked")).toBe(true);
    expect(currentReview(store.db, id)).toBeNull();

    await dispatch(defaultRegistry(), "review", ctx, "record.toggleMark");
    expect(hasTag(store.db, id, "marked")).toBe(false);
  });

  test("record stays in pending after toggle (orthogonal to state)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;
    await dispatch(defaultRegistry(), "review", ctx, "record.toggleMark");
    expect(ctx.cursor.current()?.id).toBe(id);
  });
});

describe("record.undo", () => {
  test("compensates the most recent review across the dataset", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;
    await dispatch(defaultRegistry(), "review", ctx, "record.accept");
    expect(currentReview(store.db, id)?.status).toBe("accepted");
    await dispatch(defaultRegistry(), "review", ctx, "record.undo");
    expect(currentReview(store.db, id)).toBeNull();
  });

  test("seeks cursor to the un-done record", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;
    await dispatch(defaultRegistry(), "review", ctx, "record.accept");
    expect(ctx.cursor.current()?.id).not.toBe(id);
    await dispatch(defaultRegistry(), "review", ctx, "record.undo");
    expect(ctx.cursor.current()?.id).toBe(id);
  });

  test("flashes 'Nothing to undo' when no review exists", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    await dispatch(defaultRegistry(), "review", ctx, "record.undo");
    expect(app.flash?.kind).toBe("error");
    expect(app.flash?.message).toContain("Nothing to undo");
  });
});

describe("record.skip", () => {
  test("writes status='skipped' and exits pending (ADR 0003)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = makeApp(store.db);
    const ctx = reviewContext(app);
    const id = ctx.cursor.current()!.id;
    await dispatch(defaultRegistry(), "review", ctx, "record.skip");
    expect(currentReview(store.db, id)?.status).toBe("skipped");
    expect(ctx.cursor.current()?.id).not.toBe(id);
  });
});
