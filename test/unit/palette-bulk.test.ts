import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { buildRegistry } from "../../src/actions/command.ts";
import { dispatch } from "../../src/actions/dispatch.ts";
import {
  paletteBulkAccept,
  paletteBulkRelabel,
  paletteBulkUnmark,
} from "../../src/actions/palette/bulk.ts";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { applyEffects } from "../../src/overlay/effects.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { insertReview } from "../../src/store/records.ts";
import { toggleTag } from "../../src/store/tags.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const baseConfig: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

function mkApp(db: Awaited<ReturnType<typeof openTmpStore>>["db"]) {
  return createAppContext({
    db,
    config: baseConfig,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
}

describe(":bulk-accept zero-eligible guard", () => {
  test("flashes warning and does NOT open overlay when no marked records", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = mkApp(store.db);
    const registry = buildRegistry([paletteBulkAccept]);
    await dispatch(registry, "review", app, paletteBulkAccept.name);
    expect(app.overlay).toBeNull();
    expect(app.flash?.kind).toBe("warning");
    expect(app.flash?.message).toContain("no marked");
  });

  test("flashes warning when every marked record is already reviewed", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const targets = pending.slice(0, 2);
    for (const rec of targets) {
      toggleTag(store.db, rec.id, "marked");
      insertReview(store.db, {
        record_id: rec.id,
        status: "accepted",
        final_label: rec.primaryPrediction?.label ?? "food",
        prev_label: null,
        source_of_truth: "human",
      });
    }

    const app = mkApp(store.db);
    const registry = buildRegistry([paletteBulkAccept]);
    await dispatch(registry, "review", app, paletteBulkAccept.name);
    expect(app.overlay).toBeNull();
    expect(app.flash?.kind).toBe("warning");
    expect(app.flash?.message).toContain("no eligible");
  });

  test("opens bulk-confirm overlay when there are eligible records", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const targets = pending.slice(0, 2);
    for (const rec of targets) toggleTag(store.db, rec.id, "marked");

    const app = mkApp(store.db);
    const registry = buildRegistry([paletteBulkAccept]);
    await dispatch(registry, "review", app, paletteBulkAccept.name);
    expect(app.overlay?.kind).toBe("bulk-confirm");
    if (app.overlay?.kind !== "bulk-confirm") return;
    expect(app.overlay.state.action).toBe("accept");
    expect(app.overlay.state.eligible.length).toBe(2);
    expect(app.overlay.state.excluded.length).toBe(0);
  });
});

describe(":bulk-relabel argument validation", () => {
  test("missing argument flashes error", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    toggleTag(store.db, pending[0]!.id, "marked");
    const app = mkApp(store.db);
    const registry = buildRegistry([paletteBulkRelabel]);
    await dispatch(registry, "review", app, paletteBulkRelabel.name);
    expect(app.overlay).toBeNull();
    expect(app.flash?.kind).toBe("error");
    expect(app.flash?.message).toContain("requires a label");
  });

  test("unknown label flashes error", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    toggleTag(store.db, pending[0]!.id, "marked");
    const app = mkApp(store.db);
    const registry = buildRegistry([paletteBulkRelabel]);
    await dispatch(registry, "review", app, paletteBulkRelabel.name, "not-a-label");
    expect(app.overlay).toBeNull();
    expect(app.flash?.kind).toBe("error");
    expect(app.flash?.message).toContain("not configured");
  });

  test("known label opens overlay with label set", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    toggleTag(store.db, pending[0]!.id, "marked");
    const app = mkApp(store.db);
    const registry = buildRegistry([paletteBulkRelabel]);
    await dispatch(registry, "review", app, paletteBulkRelabel.name, "other");
    expect(app.overlay?.kind).toBe("bulk-confirm");
    if (app.overlay?.kind !== "bulk-confirm") return;
    expect(app.overlay.state.label).toBe("other");
  });
});

describe(":bulk-unmark end-to-end", () => {
  test("confirm clears marked tags including already-reviewed", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const targets = pending.slice(0, 3);
    for (const rec of targets) toggleTag(store.db, rec.id, "marked");
    // Pre-review one
    insertReview(store.db, {
      record_id: targets[0]!.id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });

    const app = mkApp(store.db);
    const registry = buildRegistry([paletteBulkUnmark]);
    await dispatch(registry, "review", app, paletteBulkUnmark.name);
    expect(app.overlay?.kind).toBe("bulk-confirm");
    if (app.overlay?.kind !== "bulk-confirm") return;

    // Simulate Enter on the overlay → emits commitBulkUnmark + close.
    // Drive applyEffects with the same effects the reducer would emit.
    // Need a queue id; use "marked" since that's the natural backing queue.
    app.queueId = "marked";
    app.cursor = app.getCursor("marked");
    applyEffects(app, "marked", [
      { kind: "commitBulkUnmark", eligible: app.overlay.state.eligible },
      { kind: "close" },
    ]);

    const remaining = store.db.all<{ record_id: string }>(
      sql`SELECT record_id FROM record_tags WHERE tag = 'marked'`,
    );
    expect(remaining.length).toBe(0);
  });
});
