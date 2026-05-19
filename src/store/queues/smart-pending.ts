import { and, sql } from "drizzle-orm";
import { BUILTIN_ISSUE_TYPES, type BuiltinIssueType } from "../../learning/smart-learning.ts";
import { COMPUTED_SIGNAL_SOURCE } from "../issues.ts";
import type { QueueQuery } from "../queries.ts";
import { recordsWithPrimary } from "../schema.ts";
import { nonOrphan, unreviewed } from "./predicates.ts";
import type { QueueDefinition } from "./registry.ts";

export type SmartPendingWeights = Partial<Record<BuiltinIssueType, number>>;

export type BuildSmartPendingOptions = {
  /**
   * Multiplier per built-in Issue type. Missing or non-finite values fall back
   * to 1. All values are clamped to `[MIN_WEIGHT, MAX_WEIGHT]` so the SQL
   * score expression can't be poisoned by a malformed caller (0, negative,
   * Infinity).
   */
  weights?: SmartPendingWeights;
  /**
   * Fixed multiplier for imported Issue rows. Defaults to 1.0; clamped to
   * `[MIN_WEIGHT, MAX_WEIGHT]` for the same reason as built-in weights.
   */
  importedWeight?: number;
};

const MIN_WEIGHT = 0.25;
const MAX_WEIGHT = 3.0;

function clampWeight(x: number): number {
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, x));
}

function weightFor(weights: SmartPendingWeights | undefined, t: BuiltinIssueType): number {
  const w = weights?.[t];
  return typeof w === "number" && Number.isFinite(w) ? clampWeight(w) : 1;
}

/**
 * Build a smart-pending Queue query whose score weights every built-in Issue
 * type by the supplied multiplier and adds imported Issues at a fixed weight
 * (default 1.0). Issue score magnitude (not just presence) drives ordering:
 *
 *     score = Σ_built-in  w(type) × max(score, 0)
 *           + Σ_imported  importedWeight × max(score, 0)
 *
 * Ties fall back to confidence ASC (NULL last) then row index ASC, matching
 * the legacy boolean-sum behavior so reviewers don't see jittery reorderings
 * within an unscored tier.
 */
export function buildSmartPendingQuery(opts: BuildSmartPendingOptions = {}): QueueQuery {
  const wLow = weightFor(opts.weights, "low_confidence");
  const wDis = weightFor(opts.weights, "source_disagreement");
  const wDup = weightFor(opts.weights, "exact_duplicate");
  const wImp =
    typeof opts.importedWeight === "number" && Number.isFinite(opts.importedWeight)
      ? clampWeight(opts.importedWeight)
      : 1;

  // SQLite has no MAX(scalar, scalar); clamp negatives to 0 via CASE before
  // multiplying. NULL scores collapse to 0 via COALESCE.
  const builtinScore = sql`COALESCE((
    SELECT SUM(
      CASE i.type
        WHEN ${BUILTIN_ISSUE_TYPES[0]} THEN ${wLow}
        WHEN ${BUILTIN_ISSUE_TYPES[1]} THEN ${wDis}
        WHEN ${BUILTIN_ISSUE_TYPES[2]} THEN ${wDup}
        ELSE 0
      END
      * CASE WHEN COALESCE(i.score, 0) > 0 THEN COALESCE(i.score, 0) ELSE 0 END
    )
    FROM issues i
    WHERE i.record_id = ${recordsWithPrimary.id}
      AND i.source = ${COMPUTED_SIGNAL_SOURCE}
  ), 0)`;

  const importedScore = sql`COALESCE((
    SELECT SUM(
      ${wImp} * CASE WHEN COALESCE(i.score, 0) > 0 THEN COALESCE(i.score, 0) ELSE 0 END
    )
    FROM issues i
    WHERE i.record_id = ${recordsWithPrimary.id}
      AND (i.source IS NULL OR i.source <> ${COMPUTED_SIGNAL_SOURCE})
  ), 0)`;

  const score = sql`(${builtinScore} + ${importedScore})`;

  return {
    where: and(unreviewed(), nonOrphan()),
    orderBy: sql`${score} DESC, (${recordsWithPrimary.primaryConfidence} IS NULL), ${recordsWithPrimary.primaryConfidence} ASC, ${recordsWithPrimary.rowIndex} ASC`,
  };
}

export const smartPending: QueueDefinition = {
  id: "smart-pending",
  label: "Pending (smart)",
  query: buildSmartPendingQuery(),
};
