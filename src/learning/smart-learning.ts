/**
 * Session-local active learning for the smart-pending Queue (issue #93).
 *
 * Tracks the **relabel rate** per built-in Issue type in the current launch:
 * the numerator counts `relabeled` decisions; the denominator counts every
 * committed annotation (`accepted | relabeled | rejected`). `skipped` is
 * deferred-not-annotated (ADR 0003) and never feeds the sampler. Weights are
 * recomputed every `rerankInterval` decisions once the `rerankColdStart`
 * floor is cleared, clamped to `[0.25, 3.0]` so a noisy early session can't
 * push any type to zero or dominate the ranking. Imported Issues are never
 * sampled here — they keep a fixed weight of 1.0 inside
 * `buildSmartPendingQuery`.
 */

export const BUILTIN_ISSUE_TYPES = [
  "low_confidence",
  "source_disagreement",
  "exact_duplicate",
] as const;

export type BuiltinIssueType = (typeof BUILTIN_ISSUE_TYPES)[number];

/**
 * Decision statuses the sampler accepts. `skipped` is intentionally excluded
 * because a deferred Record reveals nothing about whether the Issue type is a
 * productive filter (ADR 0003). `undone` and `pending` are also excluded —
 * undo paths call `reverseDecision` on the prior status, not the compensating
 * row.
 */
export type LearningDecisionStatus = "accepted" | "relabeled" | "rejected";

export type SmartLearningOptions = {
  rerankInterval: number;
  rerankColdStart: number;
  /**
   * Additive (Laplace) smoothing for the lift ratio. Default 1 (standard
   * Laplace). Prevents division-by-zero and shrinks early-session estimates
   * toward the baseline so a single noisy sample can't pin a weight to the
   * clamp edges. Lower values approach the unsmoothed MLE; setting to 0 is
   * not recommended (the per-type rate becomes 0/0 when a type has been
   * sampled but never relabeled).
   */
  smoothing?: number;
};

export type SmartLearningWeights = Record<BuiltinIssueType, number>;

export type SmartLearning = {
  recordDecision(status: LearningDecisionStatus, typesPresent: BuiltinIssueType[]): void;
  reverseDecision(status: LearningDecisionStatus, typesPresent: BuiltinIssueType[]): void;
  weights(): SmartLearningWeights;
};

const MIN_WEIGHT = 0.25;
const MAX_WEIGHT = 3.0;

function oneWeights(): SmartLearningWeights {
  return { low_confidence: 1, source_disagreement: 1, exact_duplicate: 1 };
}

export function isBuiltinIssueType(value: string): value is BuiltinIssueType {
  return (BUILTIN_ISSUE_TYPES as readonly string[]).includes(value);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function createSmartLearning(opts: SmartLearningOptions): SmartLearning {
  const alpha = opts.smoothing ?? 1;
  // Clamp the bypass-time values so programmatic callers (tests, future
  // config-edit paths) can't trigger `% 0` or a coldStart that never clears.
  // TypeBox validates loaded config; this guard catches everything else.
  const rerankInterval = Math.max(1, Math.floor(opts.rerankInterval));
  const rerankColdStart = Math.max(0, Math.floor(opts.rerankColdStart));
  let totalDecisions = 0;
  let totalRelabels = 0;
  const perType: Record<BuiltinIssueType, { relabels: number; total: number }> = {
    low_confidence: { relabels: 0, total: 0 },
    source_disagreement: { relabels: 0, total: 0 },
    exact_duplicate: { relabels: 0, total: 0 },
  };
  let cached: SmartLearningWeights = oneWeights();

  function recompute(): void {
    if (totalDecisions < rerankColdStart) {
      cached = oneWeights();
      return;
    }
    const baseline = (totalRelabels + alpha) / (totalDecisions + alpha);
    if (baseline === 0) {
      cached = oneWeights();
      return;
    }
    const w = oneWeights();
    for (const t of BUILTIN_ISSUE_TYPES) {
      const counts = perType[t];
      if (counts.total === 0) {
        w[t] = 1;
        continue;
      }
      const rate = (counts.relabels + alpha) / (counts.total + alpha);
      w[t] = clamp(rate / baseline, MIN_WEIGHT, MAX_WEIGHT);
    }
    cached = w;
  }

  function maybeRecompute(): void {
    if (totalDecisions < rerankColdStart) return;
    if (totalDecisions % rerankInterval !== 0) return;
    recompute();
  }

  return {
    recordDecision(status, typesPresent) {
      totalDecisions += 1;
      const isRelabel = status === "relabeled";
      if (isRelabel) totalRelabels += 1;
      for (const t of typesPresent) {
        perType[t].total += 1;
        if (isRelabel) perType[t].relabels += 1;
      }
      maybeRecompute();
    },
    reverseDecision(status, typesPresent) {
      if (totalDecisions === 0) return;
      totalDecisions -= 1;
      const isRelabel = status === "relabeled";
      if (isRelabel && totalRelabels > 0) totalRelabels -= 1;
      for (const t of typesPresent) {
        if (perType[t].total > 0) perType[t].total -= 1;
        if (isRelabel && perType[t].relabels > 0) perType[t].relabels -= 1;
      }
      maybeRecompute();
    },
    weights() {
      return { ...cached };
    },
  };
}
