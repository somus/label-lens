import type { Db } from "../store/db.ts";
import { getMeta, setMeta } from "../store/meta.ts";
import { recomputeLowConfidence } from "./run.ts";
import type { LowConfidenceThresholds } from "./threshold.ts";

const APPLIED_META_KEY = "signals.lowConfidence.applied";

export function fingerprintThresholds(t: LowConfidenceThresholds): string {
  return JSON.stringify({ default: t.default, bySource: t.bySource });
}

export type ApplyThresholdsResult = {
  recomputed: boolean;
  fingerprint: string;
};

/**
 * Startup gate: if the low-confidence threshold fingerprint differs from the
 * one stored in `meta`, run `recomputeLowConfidence` and persist the new
 * fingerprint. Cheap when thresholds match — a single meta read, no write.
 *
 * Full-signal runs (post-ingest) refresh the fingerprint too so the next
 * startup is a no-op. Called from `cli/run.ts` after ingest settles, and
 * from `labellens config set` after a successful write.
 */
export function applyThresholdsOnStartup(
  db: Db,
  thresholds: LowConfidenceThresholds,
): ApplyThresholdsResult {
  const current = fingerprintThresholds(thresholds);
  const stored = getMeta(db, APPLIED_META_KEY);
  if (stored === current) {
    return { recomputed: false, fingerprint: current };
  }
  recomputeLowConfidence(db, thresholds);
  setMeta(db, APPLIED_META_KEY, current);
  return { recomputed: true, fingerprint: current };
}

/**
 * Imperative variant used by callers (full `runSignals` from ingest) that
 * have already done the work — just records the fingerprint so the next
 * startup skips recompute.
 */
export function recordAppliedThresholds(db: Db, thresholds: LowConfidenceThresholds): void {
  setMeta(db, APPLIED_META_KEY, fingerprintThresholds(thresholds));
}
