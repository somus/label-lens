import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { sql } from "drizzle-orm";
import { createAppContext } from "../../src/app/context.ts";
import type { LabellensConfig } from "../../src/config/config.ts";
import { defaultDisplay } from "../../src/render/capability.ts";
import { mountReviewScreen } from "../../src/screens/review.ts";
import { DEFAULT_FIELDS, openTmpStore } from "../util/tmp.ts";

const baseConfig: LabellensConfig = {
  task: "classification",
  labels: ["food", "travel", "utility", "other"],
  input: { path: "test/fixtures/tiny.jsonl", format: "jsonl", fields: DEFAULT_FIELDS },
  output: { path: "/tmp/out.jsonl", format: "jsonl" },
};

/**
 * End-to-end coverage for the issue #93 review loop: drive `mockInput`
 * keystrokes against a mounted review screen with smart-next enabled, commit
 * decisions through the real decision-action path, and assert the
 * smart-pending Cursor reorders the remaining queue.
 *
 * The unit suite covers each seam in isolation (cursor.refresh picks up new
 * weights, applyEffects calls recordDecision, query factory orders by
 * weighted sum, undo reverses). This e2e closes the gap by exercising the
 * keystroke → cursor-reorder round trip and asserts a STRICT FLIP: a pair of
 * Records whose default-weight ordering is X → Y must reverse to Y → X after
 * the learned weights take effect. A test that asserts the post-learning
 * order only is too weak; tie-breaker behavior could satisfy it without any
 * learning at all.
 */
describe("review screen — smart-learning reorders smart-pending under keystroke load", () => {
  test("strict flip: relabel-heavy type outranks relabel-empty type after learning kicks in", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    // Wipe the fixture's incoming imported Issue + extra prediction so the
    // test owns the entire Issue table. Otherwise tiny.jsonl drift could
    // change the scoring landscape underneath us.
    store.db.run(sql`DELETE FROM issues`);

    // Two "victim" Records that drive the learning sampler — both carry
    // `low_confidence`. Both get relabeled below to push the low_confidence
    // weight above 1.0 and the exact_duplicate weight below 1.0.
    const amazon = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Amazon order #12345'`,
    )[0]!;
    const lunch = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Lunch at Zomato Bangalore'`,
    )[0]!;
    // One "accepted" Record carrying `exact_duplicate` so the per-type
    // baseline diverges from the low_confidence rate.
    const uber = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Uber ride to airport'`,
    )[0]!;

    // The TWO probe Records whose relative order encodes the learning effect.
    // `probeDup` carries `exact_duplicate` with a HIGHER raw Issue score than
    // `probeLow` carries `low_confidence`. Under default weights (1.0 each):
    //   probeDup score = 1.0 × 0.50 = 0.50
    //   probeLow score = 1.0 × 0.30 = 0.30
    // → probeDup ranks ABOVE probeLow.
    //
    // After learning (computed below):
    //   probeDup score = ~0.667 × 0.50 ≈ 0.333
    //   probeLow score = ~1.333 × 0.30 ≈ 0.400
    // → probeLow ranks ABOVE probeDup. STRICT FLIP.
    const probeDup = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Salary credit October'`,
    )[0]!;
    const probeLow = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Rent transfer to landlord'`,
    )[0]!;

    const now = new Date().toISOString();
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${amazon.id},   'low_confidence',  0.5, 'labellens:computed', ${now}),
             (${lunch.id},    'low_confidence',  0.5, 'labellens:computed', ${now}),
             (${uber.id},     'exact_duplicate', 0.5, 'labellens:computed', ${now}),
             (${probeDup.id}, 'exact_duplicate', 0.5, 'labellens:computed', ${now}),
             (${probeLow.id}, 'low_confidence',  0.3, 'labellens:computed', ${now})
    `);

    const { renderer, mockInput, renderOnce } = await createTestRenderer({
      width: 140,
      height: 30,
    });
    // rerankColdStart=0 + rerankInterval=1 so each commit refreshes weights —
    // mirrors the manual-test config in docs/explanation/smart-learning.md.
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
    mountReviewScreen({ renderer, app, initialQueueId: "pending" });
    await renderOnce();
    expect(app.cursor?.queueId).toBe("smart-pending");

    // STRICT FLIP precondition: under default weights, probeDup (raw 0.5) MUST
    // outrank probeLow (raw 0.3). If this fails, the test setup is wrong and
    // the post-learning assertion would be meaningless.
    const initialIds = app.cursor!.recordIds();
    const initialDupIdx = initialIds.indexOf(probeDup.id);
    const initialLowIdx = initialIds.indexOf(probeLow.id);
    expect(initialDupIdx).toBeGreaterThanOrEqual(0);
    expect(initialLowIdx).toBeGreaterThanOrEqual(0);
    expect(initialDupIdx).toBeLessThan(initialLowIdx);

    // Drive three decisions via the real keystroke path. After each press we
    // seek to the next target so the test is deterministic regardless of
    // intermediate cursor advance.

    // Decision 1: relabel Amazon (low_confidence). Predicted 'shopping';
    // labels[2] = 'utility' → status='relabeled'.
    app.cursor!.seek(amazon.id);
    expect(app.cursor?.current()?.id).toBe(amazon.id);
    mockInput.pressKey("3");
    await renderOnce();

    // Decision 2: relabel Lunch (low_confidence). Predicted 'food';
    // labels[1] = 'travel' → status='relabeled'.
    app.cursor!.seek(lunch.id);
    expect(app.cursor?.current()?.id).toBe(lunch.id);
    mockInput.pressKey("2");
    await renderOnce();

    // Decision 3: accept Uber (exact_duplicate). Predicted 'travel' matches
    // labels[1] = 'travel' → status='accepted'.
    app.cursor!.seek(uber.id);
    expect(app.cursor?.current()?.id).toBe(uber.id);
    mockInput.pressKey("2");
    await renderOnce();

    // Lift math after these three decisions (α = 1):
    //   totalDecisions = 3, totalRelabels = 2
    //   baseline                = (2 + 1) / (3 + 1)           = 0.75
    //   low_confidence  rate    = (2 + 1) / (2 + 1)           = 1.0
    //   low_confidence  lift    = 1.0   / 0.75                ≈ 1.333
    //   exact_duplicate rate    = (0 + 1) / (1 + 1)           = 0.5
    //   exact_duplicate lift    = 0.5   / 0.75                ≈ 0.667
    const w = app.smartLearning.weights();
    expect(w.low_confidence).toBeGreaterThan(1);
    expect(w.low_confidence).toBeLessThanOrEqual(3);
    expect(w.exact_duplicate).toBeLessThan(1);
    expect(w.exact_duplicate).toBeGreaterThanOrEqual(0.25);

    // STRICT FLIP postcondition: probeLow must now rank above probeDup. If
    // the cursor wasn't using learned weights, the raw 0.5 vs 0.3 score
    // ordering from the precondition would hold and this assertion would
    // fail. Passing this strictly requires the smart-pending factory to have
    // re-queried with the live weights map.
    const finalIds = app.cursor!.recordIds();
    const finalDupIdx = finalIds.indexOf(probeDup.id);
    const finalLowIdx = finalIds.indexOf(probeLow.id);
    expect(finalDupIdx).toBeGreaterThanOrEqual(0);
    expect(finalLowIdx).toBeGreaterThanOrEqual(0);
    expect(finalLowIdx).toBeLessThan(finalDupIdx);
  });

  test("undo crossing the cold-start floor restores the default ordering", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    store.db.run(sql`DELETE FROM issues`);

    // Probe pair: default-weight ordering is probeDup → probeLow (raw 0.5 vs
    // 0.3). Reaching the floor flips it via the same lift math as the first
    // test. Undo must drop totalDecisions below the floor and *visibly*
    // restore the default ordering — that's the regression Codex caught on
    // PR #120 (without the cache-reset fix, lifted weights would persist).
    const amazon = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Amazon order #12345'`,
    )[0]!;
    const lunch = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Lunch at Zomato Bangalore'`,
    )[0]!;
    const uber = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Uber ride to airport'`,
    )[0]!;
    const probeDup = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Salary credit October'`,
    )[0]!;
    const probeLow = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Rent transfer to landlord'`,
    )[0]!;
    const now = new Date().toISOString();
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${amazon.id},   'low_confidence',  0.5, 'labellens:computed', ${now}),
             (${lunch.id},    'low_confidence',  0.5, 'labellens:computed', ${now}),
             (${uber.id},     'exact_duplicate', 0.5, 'labellens:computed', ${now}),
             (${probeDup.id}, 'exact_duplicate', 0.5, 'labellens:computed', ${now}),
             (${probeLow.id}, 'low_confidence',  0.3, 'labellens:computed', ${now})
    `);

    const { renderer, mockInput, renderOnce } = await createTestRenderer({
      width: 140,
      height: 30,
    });
    // Cold-start = 3 so the 3rd decision crosses the floor; undo drops the
    // session back to totalDecisions=2 (< floor) and must reset the cache.
    const app = createAppContext({
      db: store.db,
      config: {
        ...baseConfig,
        navigation: { smartNext: true, rerankInterval: 1, rerankColdStart: 3 },
      },
      display: defaultDisplay(),
      requestRender: () => {},
      onQuit: () => {},
    });
    mountReviewScreen({ renderer, app, initialQueueId: "pending" });
    await renderOnce();
    expect(app.cursor?.queueId).toBe("smart-pending");

    // Default-weight precondition.
    {
      const initialIds = app.cursor!.recordIds();
      expect(initialIds.indexOf(probeDup.id)).toBeLessThan(initialIds.indexOf(probeLow.id));
    }

    // Three decisions to clear the cold-start floor and bias the weights:
    //   relabel Amazon (low_confidence)
    //   relabel Lunch  (low_confidence)
    //   accept  Uber   (exact_duplicate)
    // After these: low_confidence lift ≈ 1.333, exact_duplicate lift ≈ 0.667.
    // Probe scores flip: probeLow (0.3 × 1.333 = 0.4) > probeDup (0.5 × 0.667
    // = 0.333).
    app.cursor!.seek(amazon.id);
    mockInput.pressKey("3"); // 'utility' vs predicted 'shopping' → relabeled
    await renderOnce();
    app.cursor!.seek(lunch.id);
    mockInput.pressKey("2"); // 'travel'  vs predicted 'food'     → relabeled
    await renderOnce();
    app.cursor!.seek(uber.id);
    mockInput.pressKey("2"); // 'travel'  vs predicted 'travel'   → accepted
    await renderOnce();

    // Lifted weights + flipped probe order.
    expect(app.smartLearning.weights().low_confidence).toBeGreaterThan(1);
    expect(app.smartLearning.weights().exact_duplicate).toBeLessThan(1);
    {
      const liftedIds = app.cursor!.recordIds();
      expect(liftedIds.indexOf(probeLow.id)).toBeLessThan(liftedIds.indexOf(probeDup.id));
    }

    // Undo — `record.undo` (binding 'u') reverses the most recent decision
    // (Uber accept). totalDecisions drops to 2 (< coldStart=3). Without the
    // cache-reset fix, `cached` would retain the lifted weights from the
    // last recompute and probeLow would still rank above probeDup. With the
    // fix, weights snap back to 1.0 and the probe order returns to default.
    mockInput.pressKey("u");
    await renderOnce();
    expect(app.smartLearning.weights()).toEqual({
      low_confidence: 1,
      source_disagreement: 1,
      exact_duplicate: 1,
    });
    const restoredIds = app.cursor!.recordIds();
    expect(restoredIds.indexOf(probeDup.id)).toBeLessThan(restoredIds.indexOf(probeLow.id));
  });
});
