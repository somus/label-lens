/**
 * Compute the three MVP prioritization signals from PRD §10.4 and write them
 * to the `issues` table with `source = "computed"`.
 *
 *   low_confidence       score = 1 - confidence (per prediction; max wins)
 *                        emit when confidence < threshold (default 0.5)
 *   source_disagreement  score = 1 - max_label_count / n_predictions
 *                        emit when score > 0 (≥2 distinct labels)
 *   exact_duplicate      score = group_size / total_records (cap 1.0)
 *                        emit on every member of a normalize(text) cluster
 *
 * Re-runs `purgeComputedIssues` first, so imported issues (source != "computed")
 * are preserved across re-ingest. Cancellation is checked between 500-record
 * batches and once more before the transaction commits.
 */
import { asc } from "drizzle-orm";
import type { SignalKindName } from "../config/config.ts";
import { normalize } from "../ingest/id.ts";
import type { Db, TxOrDb } from "../store/db.ts";
import {
  type ComputedIssueInput,
  insertComputedIssues,
  purgeComputedIssues,
  purgeComputedIssuesOfType,
} from "../store/issues.ts";
import { predictions, recordsWithPrimary } from "../store/schema.ts";
import { disagreementScore, duplicateScore, lowConfidenceScore } from "./compute.ts";
import {
  DEFAULT_LOW_CONFIDENCE,
  type LowConfidenceThresholds,
  resolveThreshold,
} from "./threshold.ts";

export type { SignalKindName };

export type RunSignalsOptions = {
  lowConfidence?: LowConfidenceThresholds;
  /**
   * Subset of signals to compute. Disabled signals never produce `issues` rows,
   * so their queues + signal-strip chips disappear and `smart-pending` scoring
   * stops weighting them. Omit to compute every signal (the default). `flagged`
   * lives outside this run path but is included so the gate is uniform.
   */
  enabled?: Iterable<SignalKindName>;
  /**
   * Returns true once cancellation has been requested. Checked between
   * record-batch boundaries (every 500 records). When true, the run discards
   * any not-yet-flushed work and returns `cancelled: true` without writing.
   */
  isCancelled?: () => boolean;
  onProgress?: (done: number, total: number) => void;
};

export type RunSignalsResult = {
  written: number;
  cancelled: boolean;
};

/**
 * Records processed between cancel checks + progress callbacks. 500 keeps
 * cancel latency bounded (a few ms at typical record sizes) while amortizing
 * postMessage cost on the worker path. Exported so tests can pin behavior at
 * batch boundaries.
 */
export const BATCH_SIZE = 500;

function defaultThresholds(): LowConfidenceThresholds {
  return { default: DEFAULT_LOW_CONFIDENCE, bySource: [] };
}

type PrimaryRow = {
  id: string;
  text: string;
  primaryConfidence: number | null;
  primarySource: string | null;
};

function computeLowConfidenceIssues(
  rows: PrimaryRow[],
  thresholds: LowConfidenceThresholds,
): ComputedIssueInput[] {
  const out: ComputedIssueInput[] = [];
  for (const r of rows) {
    if (r.primaryConfidence === null) continue;
    const threshold = resolveThreshold(r.primarySource, thresholds);
    const score = lowConfidenceScore(r.primaryConfidence, threshold);
    if (score === null) continue;
    out.push({ recordId: r.id, type: "low_confidence", score });
  }
  return out;
}

export function runSignals(db: Db, options: RunSignalsOptions = {}): RunSignalsResult {
  const thresholds = options.lowConfidence ?? defaultThresholds();
  const enabled = options.enabled ? new Set(options.enabled) : null;
  const lowConfEnabled = enabled === null || enabled.has("lowConfidence");
  const disagreementEnabled = enabled === null || enabled.has("disagreement");
  const duplicateEnabled = enabled === null || enabled.has("duplicate");
  const isCancelled = options.isCancelled ?? (() => false);

  const primaryRows = db
    .select({
      id: recordsWithPrimary.id,
      text: recordsWithPrimary.text,
      primaryConfidence: recordsWithPrimary.primaryConfidence,
      primarySource: recordsWithPrimary.primarySource,
    })
    .from(recordsWithPrimary)
    .orderBy(asc(recordsWithPrimary.rowIndex))
    .all();
  const total = primaryRows.length;
  if (total === 0) return { written: 0, cancelled: false };

  const dupGroups = new Map<string, string[]>();
  if (duplicateEnabled) {
    for (const r of primaryRows) {
      const key = normalize(r.text);
      const bucket = dupGroups.get(key);
      if (bucket) bucket.push(r.id);
      else dupGroups.set(key, [r.id]);
    }
  }

  let predsByRecord: Map<string, string[]> | null = null;
  if (disagreementEnabled) {
    predsByRecord = new Map();
    const predRows = db
      .select({ recordId: predictions.recordId, label: predictions.label })
      .from(predictions)
      .all();
    for (const p of predRows) {
      const list = predsByRecord.get(p.recordId);
      if (list) list.push(p.label);
      else predsByRecord.set(p.recordId, [p.label]);
    }
  }

  const pending: ComputedIssueInput[] = [];

  if (lowConfEnabled) {
    pending.push(...computeLowConfidenceIssues(primaryRows, thresholds));
  }

  let processed = 0;
  for (const r of primaryRows) {
    if (processed % BATCH_SIZE === 0 && processed > 0 && isCancelled()) {
      return { written: 0, cancelled: true };
    }

    if (disagreementEnabled && predsByRecord) {
      const labels = predsByRecord.get(r.id) ?? [];
      const dScore = disagreementScore(labels);
      if (dScore !== null && dScore > 0) {
        pending.push({ recordId: r.id, type: "source_disagreement", score: dScore });
      }
    }

    processed++;
    options.onProgress?.(processed, total);
  }

  if (duplicateEnabled) {
    for (const group of dupGroups.values()) {
      if (group.length < 2) continue;
      const score = duplicateScore(group.length, total);
      for (const id of group) {
        pending.push({ recordId: id, type: "exact_duplicate", score });
      }
    }
  }

  if (isCancelled()) return { written: 0, cancelled: true };

  db.transaction((tx) => {
    purgeComputedIssues(tx);
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      insertComputedIssues(tx, pending.slice(i, i + BATCH_SIZE));
    }
  });

  return { written: pending.length, cancelled: false };
}

/**
 * Threshold-only recompute: rewrites `low_confidence` computed Issue rows
 * against the current `thresholds`, leaving `source_disagreement`,
 * `exact_duplicate`, and all imported (non-computed) Issues untouched.
 *
 * Called from the startup gate (when thresholds differ from the last applied
 * fingerprint) and from `labellens config set` after a successful write.
 */
export function recomputeLowConfidence(
  db: Db,
  thresholds: LowConfidenceThresholds,
): { written: number } {
  const primaryRows = db
    .select({
      id: recordsWithPrimary.id,
      text: recordsWithPrimary.text,
      primaryConfidence: recordsWithPrimary.primaryConfidence,
      primarySource: recordsWithPrimary.primarySource,
    })
    .from(recordsWithPrimary)
    .orderBy(asc(recordsWithPrimary.rowIndex))
    .all();
  const pending = computeLowConfidenceIssues(primaryRows, thresholds);
  db.transaction((tx: TxOrDb) => {
    purgeComputedIssuesOfType(tx, "low_confidence");
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      insertComputedIssues(tx, pending.slice(i, i + BATCH_SIZE));
    }
  });
  return { written: pending.length };
}
