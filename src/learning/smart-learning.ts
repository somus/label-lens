/**
 * Session-local active learning for the smart-pending Queue (issue #93).
 *
 * Tracks `relabeled` decisions per built-in Issue type in the current launch
 * and re-weights the smart-pending score every `rerankInterval` decisions
 * once the `rerankColdStart` floor is cleared. Weights are clamped to
 * `[0.25, 3.0]` so a noisy early session can't push any type to zero or
 * dominate the ranking. Imported Issues are never sampled here — they keep a
 * fixed weight of 1.0 inside `buildSmartPendingQuery`.
 */

export const BUILTIN_ISSUE_TYPES = [
  "low_confidence",
  "source_disagreement",
  "exact_duplicate",
] as const;

export type BuiltinIssueType = (typeof BUILTIN_ISSUE_TYPES)[number];

export type LearningDecisionStatus = "accepted" | "relabeled" | "rejected" | "skipped";

export type SmartLearningOptions = {
  rerankInterval: number;
  rerankColdStart: number;
  /** Additive smoothing for the lift ratio. Default 1. */
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
  let totalDecisions = 0;
  let totalRelabels = 0;
  const perType: Record<BuiltinIssueType, { relabels: number; total: number }> = {
    low_confidence: { relabels: 0, total: 0 },
    source_disagreement: { relabels: 0, total: 0 },
    exact_duplicate: { relabels: 0, total: 0 },
  };
  let cached: SmartLearningWeights = oneWeights();

  function recompute(): void {
    if (totalDecisions < opts.rerankColdStart) {
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
    if (totalDecisions < opts.rerankColdStart) return;
    if (totalDecisions % opts.rerankInterval !== 0) return;
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
