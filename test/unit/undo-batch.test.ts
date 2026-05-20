import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { buildRegistry } from "../../src/actions/command.ts";
import { dispatch } from "../../src/actions/dispatch.ts";
import { commitBatch } from "../../src/actions/record/bulk.ts";
import { undo } from "../../src/actions/record/undo.ts";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { currentReview, queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { toggleTag } from "../../src/store/tags.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const baseConfig: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

function mkApp(db: Awaited<ReturnType<typeof openTmpStore>>["db"]) {
  const app = createAppContext({
    db,
    config: baseConfig,
    display: defaultDisplay(),
    requestRender: () => {},
    onQuit: () => {},
  });
  app.queueId = "pending";
  app.cursor = app.getCursor("pending");
  return app;
}

describe("record.undo batch path", () => {
  test("u reverses every effective Review in the latest batch", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const targets = pending.slice(0, 3);
    for (const rec of targets) toggleTag(store.db, rec.id, "marked");

    const app = mkApp(store.db);
    const result = commitBatch(app, "pending", { action: "accept", eligible: targets });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // All three records now have an effective accepted review.
    for (const rec of targets) {
      const cur = currentReview(store.db, rec.id);
      expect(cur?.status).toBe("accepted");
      expect(cur?.batch_id).toBe(result.batchId);
    }

    const registry = buildRegistry([undo]);
    await dispatch(registry, "review", app, undo.name);

    // After undo: every member's current effective review should be null
    // (the only non-undone entries are the compensating ones, which the
    // view filters out via the `compensates_review_id NOT NULL` exclusion).
    for (const rec of targets) {
      expect(currentReview(store.db, rec.id)).toBeNull();
    }

    // Compensating rows: one per batch member.
    const undoneRows = store.db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM reviews WHERE status = 'undone'`,
    )[0]!.n;
    expect(undoneRows).toBe(3);
  });
});

describe("record.undo single-entry path unchanged when latest review has no batch_id", () => {
  test("single accepted review undoes one row", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const target = pending[0]!;

    const app = mkApp(store.db);
    // Insert one normal review via the standard effect path style.
    store.db.run(sql`
      INSERT INTO reviews (record_id, status, final_label, prev_label, reviewed_at, source_of_truth, batch_id)
      VALUES (${target.id}, 'accepted', 'food', NULL, ${new Date().toISOString()}, 'human', NULL)
    `);

    expect(currentReview(store.db, target.id)?.status).toBe("accepted");

    const registry = buildRegistry([undo]);
    await dispatch(registry, "review", app, undo.name);

    expect(currentReview(store.db, target.id)).toBeNull();
    const undoneRows = store.db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM reviews WHERE status = 'undone'`,
    )[0]!.n;
    expect(undoneRows).toBe(1);
  });
});
