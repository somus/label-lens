import { describe, expect, test } from "bun:test";
import { commitBatch } from "../../src/actions/record/bulk.ts";
import { createAppContext } from "../../src/app/context.ts";
import { collapseHistoryByBatch } from "../../src/app/sidebar-data.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { queueRecords, recentReviewsWithText } from "../../src/store/queries.ts";
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

describe("collapseHistoryByBatch", () => {
  test("folds three batch entries into one summary row with batchCount=3", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const targets = pending.slice(0, 3);
    for (const rec of targets) toggleTag(store.db, rec.id, "marked");

    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    commitBatch(app, "pending", { action: "accept", eligible: targets });

    const rawHistory = recentReviewsWithText(store.db, 50);
    expect(rawHistory.length).toBe(3);

    const collapsed = collapseHistoryByBatch(rawHistory);
    expect(collapsed.length).toBe(1);
    expect(collapsed[0]?.batchCount).toBe(3);
    expect(collapsed[0]?.status).toBe("accepted");
  });

  test("non-batch entries pass through unchanged", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    insertReview(store.db, {
      record_id: pending[0]!.id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    insertReview(store.db, {
      record_id: pending[1]!.id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });

    const raw = recentReviewsWithText(store.db, 50);
    const collapsed = collapseHistoryByBatch(raw);
    expect(collapsed.length).toBe(2);
    expect(collapsed[0]?.batchCount).toBeUndefined();
    expect(collapsed[1]?.batchCount).toBeUndefined();
  });

  test("undo rows compensating a batch inherit batch_id and collapse to one summary row", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const targets = pending.slice(0, 3);
    for (const rec of targets) toggleTag(store.db, rec.id, "marked");

    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    commitBatch(app, "pending", { action: "accept", eligible: targets });

    const { insertUndoEntry } = await import("../../src/store/queries.ts");
    for (const rec of targets) insertUndoEntry(store.db, rec.id);

    // After undo the original accepted rows are compensated and excluded
    // from recentReviewsWithText; only the 3 undo rows remain. They share
    // the batch_id of the rows they compensated, so the collapser folds
    // them into one summary row.
    const raw = recentReviewsWithText(store.db, 50);
    expect(raw.length).toBe(3);
    expect(raw.every((r) => r.status === "undone")).toBe(true);
    expect(raw.every((r) => r.batch_id === raw[0]!.batch_id)).toBe(true);

    const collapsed = collapseHistoryByBatch(raw);
    expect(collapsed.length).toBe(1);
    expect(collapsed[0]?.status).toBe("undone");
    expect(collapsed[0]?.batchCount).toBe(3);
  });

  test("mixed: batch row + standalone row produces two rows", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    // Standalone first (older).
    insertReview(store.db, {
      record_id: pending[3]!.id,
      status: "accepted",
      final_label: "food",
      prev_label: null,
      source_of_truth: "human",
    });
    // Batch on top.
    const batchTargets = pending.slice(0, 2);
    for (const rec of batchTargets) toggleTag(store.db, rec.id, "marked");
    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    commitBatch(app, "pending", { action: "accept", eligible: batchTargets });

    const raw = recentReviewsWithText(store.db, 50);
    const collapsed = collapseHistoryByBatch(raw);
    expect(collapsed.length).toBe(2);
    expect(collapsed[0]?.batchCount).toBe(2);
    expect(collapsed[1]?.batchCount).toBeUndefined();
  });
});
