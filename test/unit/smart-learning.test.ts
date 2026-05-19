import { describe, expect, test } from "bun:test";
import { createSmartLearning } from "../../src/learning/smart-learning.ts";

describe("smart-learning — cold start", () => {
  test("returns 1.0 for every built-in Issue type before the cold-start threshold", () => {
    const sl = createSmartLearning({ rerankInterval: 5, rerankColdStart: 50 });

    // Simulate 49 decisions, mostly relabels on `low_confidence` — still cold.
    for (let i = 0; i < 49; i++) {
      sl.recordDecision("relabeled", ["low_confidence"]);
    }

    expect(sl.weights()).toEqual({
      low_confidence: 1,
      source_disagreement: 1,
      exact_duplicate: 1,
    });
  });
});

describe("smart-learning — rerank interval", () => {
  test("weights stay cached between rerank ticks", () => {
    const sl = createSmartLearning({ rerankInterval: 10, rerankColdStart: 50 });

    // Reach exactly the 50th decision: 25 relabels on low_confidence + 25
    // accepts carrying no built-in Issue (baseline relabel rate ≈ 0.5).
    // 50 % 10 === 0 so this IS a tick — capture the snapshot.
    for (let i = 0; i < 25; i++) sl.recordDecision("relabeled", ["low_confidence"]);
    for (let i = 0; i < 25; i++) sl.recordDecision("accepted", []);
    const tick50 = sl.weights();
    expect(tick50.low_confidence).toBeGreaterThan(1);

    // Decisions 51..59 keep relabeling exact_duplicate. Without interval gating,
    // exact_duplicate would lift above 1. With gating, weights stay frozen at
    // the 50-tick snapshot until tick 60.
    for (let i = 0; i < 9; i++) sl.recordDecision("relabeled", ["exact_duplicate"]);
    expect(sl.weights()).toEqual(tick50);

    // 60th decision crosses the next tick boundary → recompute.
    sl.recordDecision("relabeled", ["exact_duplicate"]);
    const tick60 = sl.weights();
    expect(tick60.exact_duplicate).toBeGreaterThan(tick50.exact_duplicate);
  });
});

describe("smart-learning — undo crosses cold-start floor", () => {
  test("reversing back below rerankColdStart restores cached weights to 1.0", () => {
    // Tight floor so the round trip stays inside the test: coldStart=2,
    // interval=1. After 2 decisions we cross the floor and pick up learned
    // weights; one reverse drops totalDecisions to 1, which must restore
    // cached weights to 1.0 — otherwise smart-pending stays reweighted even
    // though the session is back under the documented cold-start gate.
    const sl = createSmartLearning({ rerankInterval: 1, rerankColdStart: 2 });

    sl.recordDecision("accepted", []);
    sl.recordDecision("relabeled", ["low_confidence"]);
    expect(sl.weights().low_confidence).toBeGreaterThan(1);

    sl.reverseDecision("relabeled", ["low_confidence"]);
    expect(sl.weights()).toEqual({
      low_confidence: 1,
      source_disagreement: 1,
      exact_duplicate: 1,
    });
  });
});

describe("smart-learning — reverseDecision at zero", () => {
  test("reversing before any decision is a no-op and leaves weights at 1.0", () => {
    const sl = createSmartLearning({ rerankInterval: 1, rerankColdStart: 0 });

    // Calling reverseDecision with empty counters must not throw, must not
    // underflow `totalDecisions`, and must keep weights at the default 1.0.
    sl.reverseDecision("relabeled", ["low_confidence"]);
    sl.reverseDecision("accepted", []);

    expect(sl.weights()).toEqual({
      low_confidence: 1,
      source_disagreement: 1,
      exact_duplicate: 1,
    });

    // After the no-op reversals, the very first recordDecision should still
    // behave normally — confirms counters were not corrupted into negative.
    sl.recordDecision("relabeled", ["low_confidence"]);
    expect(sl.weights().low_confidence).toBeGreaterThanOrEqual(1);
  });
});

describe("smart-learning — reverseDecision (undo)", () => {
  test("reversing a relabeled sample returns the type's lift to baseline", () => {
    // Interval 1 + cold-start 0 so each call updates the cache; deterministic
    // baseline to compare against.
    const sl = createSmartLearning({ rerankInterval: 1, rerankColdStart: 0 });

    // Distractor decisions carry no built-in Issue, so low_confidence stays
    // empty and weights() returns 1.0 for it.
    for (let i = 0; i < 10; i++) sl.recordDecision("accepted", []);
    const baseline = sl.weights();
    expect(baseline.low_confidence).toBe(1);

    sl.recordDecision("relabeled", ["low_confidence"]);
    const liftedRelabel = sl.weights();
    expect(liftedRelabel.low_confidence).toBeGreaterThan(baseline.low_confidence);

    sl.reverseDecision("relabeled", ["low_confidence"]);
    expect(sl.weights()).toEqual(baseline);
  });
});

describe("smart-learning — multi-Issue credit", () => {
  test("a relabeled Record credits every built-in Issue type it carried", () => {
    // Cold-start at 0 so the very first decision shapes weights; interval 1
    // means weights recompute immediately on each call.
    const sl = createSmartLearning({ rerankInterval: 1, rerankColdStart: 0 });

    // One Record relabeled while carrying both low_confidence + source_disagreement.
    sl.recordDecision("relabeled", ["low_confidence", "source_disagreement"]);
    // 19 distractor accepts on exact_duplicate so baseline is well below 1.0.
    for (let i = 0; i < 19; i++) sl.recordDecision("accepted", ["exact_duplicate"]);

    const w = sl.weights();
    // Both credited types had a 1/1 relabel rate — both must lift above 1.
    expect(w.low_confidence).toBeGreaterThan(1);
    expect(w.source_disagreement).toBeGreaterThan(1);
    // The uncredited distractor type ran 19 accepts → rate well below baseline.
    expect(w.exact_duplicate).toBeLessThan(1);
  });
});

describe("smart-learning — smoothed lift", () => {
  test("relabel-heavy type lifts above 1.0; relabel-empty type drops below (clamped)", () => {
    // Cold-start cleared at 50 decisions; recompute every decision so we can
    // assert the post-50th state directly.
    const sl = createSmartLearning({ rerankInterval: 1, rerankColdStart: 50 });

    // 25 relabels carrying `low_confidence`; 25 accepts carrying `exact_duplicate`.
    for (let i = 0; i < 25; i++) sl.recordDecision("relabeled", ["low_confidence"]);
    for (let i = 0; i < 25; i++) sl.recordDecision("accepted", ["exact_duplicate"]);

    const w = sl.weights();
    expect(w.low_confidence).toBeGreaterThan(1);
    expect(w.low_confidence).toBeLessThanOrEqual(3);
    expect(w.exact_duplicate).toBeLessThan(1);
    expect(w.exact_duplicate).toBeGreaterThanOrEqual(0.25);
    // No samples carried `source_disagreement`, so its lift is undefined → 1.0.
    expect(w.source_disagreement).toBe(1);
  });
});
