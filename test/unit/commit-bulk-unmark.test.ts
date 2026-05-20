import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { commitBulkUnmark } from "../../src/actions/record/bulk.ts";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
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

describe("commitBulkUnmark clears marked tag regardless of review state", () => {
  test("removes marked from every supplied record (reviewed + unreviewed)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const targets = pending.slice(0, 3);
    for (const rec of targets) toggleTag(store.db, rec.id, "marked");

    // Pre-review one of the marked records — :bulk unmark must still clear it.
    insertReview(store.db, {
      record_id: targets[0]!.id,
      status: "accepted",
      final_label: targets[0]!.primaryPrediction?.label ?? "food",
      prev_label: null,
      source_of_truth: "human",
    });

    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });

    const cleared = commitBulkUnmark(app, targets);
    expect(cleared).toBe(3);

    const remaining = store.db.all<{ record_id: string }>(
      sql`SELECT record_id FROM record_tags WHERE tag = 'marked'`,
    );
    expect(remaining.length).toBe(0);

    // No new reviews written for unmark.
    const reviewCount = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM reviews`)[0]!.n;
    expect(reviewCount).toBe(1); // only the pre-existing accepted review
  });

  test("zero records is a no-op (returns 0)", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    expect(commitBulkUnmark(app, [])).toBe(0);
  });
});
