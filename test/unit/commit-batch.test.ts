import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { commitBatch } from "../../src/actions/record/bulk.ts";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { queueRecords } from "../../src/store/queries.ts";
import { resolveQueue } from "../../src/store/queues/registry.ts";
import { toggleTag } from "../../src/store/tags.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const baseConfig: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

describe("commitBatch relabel rejects unknown labels and requires explicit label", () => {
  test("missing-label when input.label omitted", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const targets = pending.slice(0, 2);
    for (const rec of targets) toggleTag(store.db, rec.id, "marked");

    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });

    const result = commitBatch(app, "pending", { action: "relabel", eligible: targets });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing-label");

    const reviewCount = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM reviews`)[0]!.n;
    expect(reviewCount).toBe(0);
  });

  test("unknown-label when label is not configured", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const targets = pending.slice(0, 2);

    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });

    const result = commitBatch(app, "pending", {
      action: "relabel",
      eligible: targets,
      label: "not-a-label",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unknown-label");

    const reviewCount = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM reviews`)[0]!.n;
    expect(reviewCount).toBe(0);
  });

  test("relabel happy path: writes reviews with the chosen label and shared batch_id", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const targets = pending.slice(0, 2);
    for (const rec of targets) toggleTag(store.db, rec.id, "marked");

    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });

    const result = commitBatch(app, "pending", {
      action: "relabel",
      eligible: targets,
      label: "other",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = store.db.all<{
      record_id: string;
      status: string;
      final_label: string | null;
      batch_id: string | null;
    }>(
      sql`SELECT record_id, status, final_label, batch_id FROM reviews
          WHERE record_id IN (${targets[0]!.id}, ${targets[1]!.id})`,
    );
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.final_label).toBe("other");
      expect(row.batch_id).toBe(result.batchId);
      // None of the predictions in tiny.jsonl equals "other", so all relabeled.
      expect(row.status).toBe("relabeled");
    }
  });
});

describe("commitBatch reject + skip happy paths", () => {
  test("reject writes rejected reviews with prev_label set to predicted, shared batch_id", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const targets = pending.slice(0, 2);
    for (const rec of targets) toggleTag(store.db, rec.id, "marked");

    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });

    const result = commitBatch(app, "pending", { action: "reject", eligible: targets });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = store.db.all<{
      status: string;
      final_label: string | null;
      prev_label: string | null;
      batch_id: string | null;
    }>(
      sql`SELECT status, final_label, prev_label, batch_id FROM reviews
          WHERE record_id IN (${targets[0]!.id}, ${targets[1]!.id})`,
    );
    expect(rows.length).toBe(2);
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i]!.status).toBe("rejected");
      expect(rows[i]!.final_label).toBeNull();
      expect(rows[i]!.batch_id).toBe(result.batchId);
    }
  });

  test("skip writes skipped reviews; no smart-learning credit fed", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const targets = pending.slice(0, 2);
    for (const rec of targets) toggleTag(store.db, rec.id, "marked");

    const app = createAppContext({
      db: store.db,
      config: { ...baseConfig, navigation: { rerankInterval: 1, rerankColdStart: 0 } },
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });

    const weightsBefore = app.smartLearning.weights();
    const result = commitBatch(app, "pending", { action: "skip", eligible: targets });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = store.db.all<{ status: string; batch_id: string | null }>(
      sql`SELECT status, batch_id FROM reviews
          WHERE record_id IN (${targets[0]!.id}, ${targets[1]!.id})`,
    );
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.status).toBe("skipped");
      expect(row.batch_id).toBe(result.batchId);
    }
    // Skipped never feeds the sampler.
    expect(app.smartLearning.weights()).toEqual(weightsBefore);
  });
});

describe("commitBatch accept atomic abort when any eligible target lacks primary prediction", () => {
  test("zero reviews written, marked stays on all targets", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    const pending = queueRecords(store.db, resolveQueue("pending").query);
    const withPrediction = pending.slice(0, 2);
    for (const rec of withPrediction) toggleTag(store.db, rec.id, "marked");

    // Forge a record with NO primary prediction by inserting one directly.
    const orphanId = "rec-no-pred-aaaa";
    store.db.run(sql`
      INSERT INTO records (id, source_path, row_index, text, raw, orphan)
      VALUES (${orphanId}, 'manual', 9999, 'no prediction', '{}', 0)
    `);
    toggleTag(store.db, orphanId, "marked");
    const orphan = queueRecords(store.db, {
      where: sql`${sql.identifier("records_with_primary")}.id = ${orphanId}`,
    })[0]!;
    expect(orphan.primaryPrediction).toBeNull();

    const eligible = [...withPrediction, orphan];

    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });

    const result = commitBatch(app, "pending", { action: "accept", eligible });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no-prediction");

    const reviewCount = store.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM reviews`)[0]!.n;
    expect(reviewCount).toBe(0);

    const stillMarked = store.db.all<{ record_id: string }>(
      sql`SELECT record_id FROM record_tags WHERE tag = 'marked'`,
    );
    expect(stillMarked.length).toBe(3);
  });
});

describe("commitBatch accept happy path", () => {
  test("writes N reviews with one shared batch_id, source_of_truth=human, clears marked", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    const pending = queueRecords(store.db, resolveQueue("pending").query);
    expect(pending.length).toBeGreaterThanOrEqual(3);
    const targets = pending.slice(0, 3);
    for (const rec of targets) toggleTag(store.db, rec.id, "marked");

    const app = createAppContext({
      db: store.db,
      config: baseConfig,
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });

    const result = commitBatch(app, "pending", { action: "accept", eligible: targets });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.affected).toBe(3);
    expect(result.batchId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const rows = store.db.all<{ batch_id: string | null; status: string; source_of_truth: string }>(
      sql`SELECT batch_id, status, source_of_truth FROM reviews WHERE record_id IN (
        ${targets[0]!.id}, ${targets[1]!.id}, ${targets[2]!.id}
      )`,
    );
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.batch_id).toBe(result.batchId);
      expect(row.status).toBe("accepted");
      expect(row.source_of_truth).toBe("human");
    }

    const markedTags = store.db.all<{ record_id: string }>(
      sql`SELECT record_id FROM record_tags WHERE tag = 'marked'
          AND record_id IN (${targets[0]!.id}, ${targets[1]!.id}, ${targets[2]!.id})`,
    );
    expect(markedTags.length).toBe(0);
  });
});
