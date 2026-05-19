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
 * Closes the unit-test gap that let issue #93's user-visible reorder appear
 * silent under live use: the unit suite verified each seam in isolation but
 * never drove a keystroke → cursor-reorder round trip end to end.
 */
describe("review screen — smart-learning reorders smart-pending under keystroke load", () => {
  test("relabel-heavy type lifts records carrying it above records carrying a relabel-empty type", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });

    // Wipe the fixture's incoming imported Issue + extra prediction so the
    // four target Records below are the only ones carrying built-in Issues.
    // This isolates the test from tiny.jsonl drift.
    store.db.run(sql`DELETE FROM issues`);

    // Pick four Records with comparable raw scores so the default-weight
    // ordering is driven by the SQL tie-breakers (confidence ASC, row_index
    // ASC) and not by raw Issue score magnitude. Once learning kicks in, the
    // per-type weights must override the tie-breakers.
    const lunch = store.db.all<{ id: string; row_index: number }>(
      sql`SELECT id, row_index FROM records WHERE text = 'Lunch at Zomato Bangalore'`,
    )[0]!;
    const uber = store.db.all<{ id: string; row_index: number }>(
      sql`SELECT id, row_index FROM records WHERE text = 'Uber ride to airport'`,
    )[0]!;
    const amazon = store.db.all<{ id: string; row_index: number }>(
      sql`SELECT id, row_index FROM records WHERE text = 'Amazon order #12345'`,
    )[0]!;
    const rent = store.db.all<{ id: string; row_index: number }>(
      sql`SELECT id, row_index FROM records WHERE text = 'Rent transfer to landlord'`,
    )[0]!;

    const now = new Date().toISOString();
    // Lunch + Amazon carry `low_confidence`; Uber + Rent carry `exact_duplicate`.
    // All four Issue scores are identical (0.5) so the default-weight smart-
    // pending score is also identical — ordering falls back to tie-breakers.
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${lunch.id},  'low_confidence',  0.5, 'labellens:computed', ${now}),
             (${uber.id},   'exact_duplicate', 0.5, 'labellens:computed', ${now}),
             (${amazon.id}, 'low_confidence',  0.5, 'labellens:computed', ${now}),
             (${rent.id},   'exact_duplicate', 0.5, 'labellens:computed', ${now})
    `);

    const { renderer, mockInput, renderOnce } = await createTestRenderer({
      width: 140,
      height: 30,
    });
    // Tight learning knobs so the first relabel flips weights immediately —
    // mirror the manual-test config in docs/explanation/smart-learning.md.
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

    // The four Records all share score = 1.0 × 0.5 = 0.5. They tie on the
    // primary score; the SQL tie-breakers fall to confidence ASC (NULL last)
    // then row_index ASC. tiny.jsonl confidences:
    //   Lunch 0.92, Uber 0.88, Amazon 0.74, Rent 0.96.
    // So within the tied tier the cursor order is Amazon → Uber → Lunch → Rent.
    const initialOrder = app.cursor!.recordIds();
    expect(initialOrder.slice(0, 4)).toEqual([amazon.id, uber.id, lunch.id, rent.id]);

    // Drive two keystrokes that relabel `low_confidence` carriers (status =
    // 'relabeled' because the chosen labels differ from the predictions).
    // Press `2` while Amazon is focused (predicted 'shopping' → 'travel'),
    // then `1` while Uber is focused (predicted 'travel' → 'food').
    //
    // Wait — Uber relabel would credit `exact_duplicate`, not low_confidence.
    // To bias purely toward `low_confidence`, relabel Amazon then Lunch
    // (both `low_confidence`). After Amazon commit, cursor advances; Lunch is
    // now at the position Amazon held minus one — but the queue refreshes
    // re-running queueRecords, so positions shift. Seek to Lunch explicitly
    // before pressing the next key so the test is deterministic regardless of
    // intermediate refresh side effects.
    expect(app.cursor?.current()?.id).toBe(amazon.id);
    // 'utility' (predicted 'shopping') → status = 'relabeled' for Amazon.
    mockInput.pressKey("3");
    await renderOnce();

    // After commit, Amazon is filtered out of smart-pending; cursor lands on
    // the next head record (Uber under the previous tie ordering).
    app.cursor!.seek(lunch.id);
    expect(app.cursor?.current()?.id).toBe(lunch.id);
    // 'travel' (predicted 'food') → status = 'relabeled' for Lunch.
    mockInput.pressKey("2");
    await renderOnce();

    // Two relabels, both on `low_confidence` carriers. Per the smoothed lift:
    //   total decisions = 2, total relabels = 2
    //   baseline       = (2 + 1) / (2 + 1) = 1.0
    //   low_confidence rate = (2 + 1) / (2 + 1) = 1.0 → lift 1.0
    //   exact_duplicate  rate = 0/0 → defaults to 1.0
    // Equal lifts means equal scores still. We need a non-relabel decision on
    // an `exact_duplicate` carrier so the baseline diverges from the type
    // rates. Accept Uber (predicted 'travel' === label 'travel' at index 2
    // → status = 'accepted').
    expect(app.cursor!.recordIds()).toContain(uber.id);
    app.cursor!.seek(uber.id);
    expect(app.cursor?.current()?.id).toBe(uber.id);
    mockInput.pressKey("2");
    await renderOnce();

    // Updated counters: total decisions = 3, total relabels = 2.
    //   baseline                = (2 + 1) / (3 + 1) = 0.75
    //   low_confidence rate     = (2 + 1) / (2 + 1) = 1.0 → lift ≈ 1.333
    //   exact_duplicate rate    = (0 + 1) / (1 + 1) = 0.5 → lift ≈ 0.667
    // Only Rent (exact_duplicate, score 0.5) remains untouched. Its weighted
    // score: 0.5 × 0.667 ≈ 0.333. Any unrelated pending Record sits at score
    // 0. So Rent should still be the highest-scored Record remaining…
    //
    // The reorder we want to assert: had Rent's type been the relabel-heavy
    // one, it would have outranked the no-Issue Records by a wider margin.
    // To prove learning is actively re-weighting, attach a NEW pair of equal-
    // score Records mid-test and assert the low_confidence carrier outranks
    // the exact_duplicate carrier.
    const ghostA = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Coffee at Blue Tokai'`,
    )[0]!;
    const ghostB = store.db.all<{ id: string }>(
      sql`SELECT id FROM records WHERE text = 'Refund from Swiggy'`,
    )[0]!;
    store.db.run(
      sql`DELETE FROM predictions WHERE record_id = ${ghostA.id} AND label = 'shopping'`,
    );
    const now2 = new Date().toISOString();
    store.db.run(sql`
      INSERT INTO issues (record_id, type, score, source, created_at)
      VALUES (${ghostA.id}, 'low_confidence',  0.5, 'labellens:computed', ${now2}),
             (${ghostB.id}, 'exact_duplicate', 0.5, 'labellens:computed', ${now2})
    `);
    app.cursor!.refresh();
    await renderOnce();

    // With the learned weights, ghostA (low_confidence: lift 1.333 → score
    // 0.667) must rank above ghostB (exact_duplicate: lift 0.667 → score
    // 0.333), even though they share the same raw Issue score.
    const finalIds = app.cursor!.recordIds();
    const ghostAIdx = finalIds.indexOf(ghostA.id);
    const ghostBIdx = finalIds.indexOf(ghostB.id);
    expect(ghostAIdx).toBeGreaterThanOrEqual(0);
    expect(ghostBIdx).toBeGreaterThanOrEqual(0);
    expect(ghostAIdx).toBeLessThan(ghostBIdx);

    // And the live weights expose the same lift externally — a future
    // `:weights` palette command would surface this for end-users.
    const w = app.smartLearning.weights();
    expect(w.low_confidence).toBeGreaterThan(1);
    expect(w.exact_duplicate).toBeLessThan(1);
  });
});
