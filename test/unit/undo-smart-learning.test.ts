import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { undo } from "../../src/actions/record/undo.ts";
import { createAppContext, enterReview } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { applyEffects } from "../../src/overlay/effects.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const baseConfig: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

describe("undo reverses a smart-learning relabel sample", () => {
  test("undoing a relabel returns the type's lift to the pre-relabel baseline", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    const target = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Salary credit October'`,
    )[0]!;
    // Five DISTINCT distractor Records — committing the same id repeatedly
    // would conflate the learning sampler with effective_reviews semantics.
    const distractors = store.db.all<{ id: string }>(
      sql`SELECT id FROM records
          WHERE text IN ('Lunch at Zomato Bangalore', 'Uber ride to airport',
                         'Amazon order #12345', 'Netflix monthly',
                         'Rent transfer to landlord')`,
    );
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${target.id}, 'low_confidence', 0.5, 'labellens:computed', ${new Date().toISOString()})
    `);

    const app = createAppContext({
      db: store.db,
      config: {
        ...baseConfig,
        navigation: { smartNext: true, rerankInterval: 1, rerankColdStart: 0 },
      },
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    enterReview(app, "pending");

    // Drive distractor accepts on five distinct Records so the relabel-lift
    // comparison has a non-degenerate baseline.
    expect(distractors.length).toBe(5);
    for (const ghost of distractors) {
      applyEffects(app, "pending", [
        {
          kind: "commitDecision",
          recordId: ghost.id,
          status: "accepted",
          finalLabel: "food",
          prevLabel: null,
          sourceOfTruth: "human",
        },
      ]);
    }
    const baseline = app.smartLearning.weights();

    applyEffects(app, "pending", [
      {
        kind: "commitDecision",
        recordId: target.id,
        status: "relabeled",
        finalLabel: "other",
        prevLabel: "salary",
        sourceOfTruth: "human",
      },
    ]);
    expect(app.smartLearning.weights().low_confidence).toBeGreaterThan(baseline.low_confidence);

    // `record.undo` Command must reverse the most recent relabel — counters
    // and resulting weights return to the pre-relabel baseline.
    undo.run(app);
    expect(app.smartLearning.weights()).toEqual(baseline);
  });
});
