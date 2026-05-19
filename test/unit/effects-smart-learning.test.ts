import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createAppContext } from "../../src/app/context.ts";
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

describe("applyEffects feeds smart-learning samples on commitDecision", () => {
  test("relabeled decision credits matching built-in Issue type", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    // Attach a built-in `low_confidence` Issue to one Record so the relabel
    // has something to credit.
    const target = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Salary credit October'`,
    )[0]!;
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${target.id}, 'low_confidence', 0.5, 'labellens:computed', ${new Date().toISOString()})
    `);

    // rerankInterval=1, rerankColdStart=0 so the first commit shifts weights.
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

    // Baseline: no decisions yet → all weights 1.0.
    expect(app.smartLearning.weights()).toEqual({
      low_confidence: 1,
      source_disagreement: 1,
      exact_duplicate: 1,
    });

    // Drive distractor decisions on FIVE DISTINCT Records so the learning
    // baseline has a non-trivial denominator built from independent samples,
    // not from re-committing the same record id (which would exploit a
    // sampler/effective_reviews quirk and obscure the test's intent).
    const distractors = store.db.all<{ id: string }>(
      sql`SELECT id FROM records
          WHERE text IN ('Lunch at Zomato Bangalore', 'Uber ride to airport',
                         'Amazon order #12345', 'Netflix monthly',
                         'Rent transfer to landlord')`,
    );
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

    // The relabeled Record carried `low_confidence`; lift must be > 1.
    expect(app.smartLearning.weights().low_confidence).toBeGreaterThan(1);
  });
});
