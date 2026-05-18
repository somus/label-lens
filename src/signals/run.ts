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
import type { Db } from "../store/db.ts";
import {
  type ComputedIssueInput,
  insertComputedIssues,
  purgeComputedIssues,
} from "../store/issues.ts";
import { predictions, records } from "../store/schema.ts";
import { disagreementScore, duplicateScore, lowConfidenceScore } from "./compute.ts";

export type { SignalKindName };

export type RunSignalsOptions = {
  lowConfidenceThreshold?: number;
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
const DEFAULT_LOW_CONFIDENCE = 0.5;

export function runSignals(db: Db, options: RunSignalsOptions = {}): RunSignalsResult {
  const threshold = options.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE;
  const enabled = options.enabled ? new Set(options.enabled) : null;
  const lowConfEnabled = enabled === null || enabled.has("lowConfidence");
  const disagreementEnabled = enabled === null || enabled.has("disagreement");
  const duplicateEnabled = enabled === null || enabled.has("duplicate");
  const isCancelled = options.isCancelled ?? (() => false);

  const recordRows = db
    .select({ id: records.id, text: records.text })
    .from(records)
    .orderBy(asc(records.rowIndex))
    .all();
  const total = recordRows.length;
  if (total === 0) return { written: 0, cancelled: false };

  // Build duplicate groups in a single pass over records.
  const dupGroups = new Map<string, string[]>();
  for (const r of recordRows) {
    const key = normalize(r.text);
    const bucket = dupGroups.get(key);
    if (bucket) bucket.push(r.id);
    else dupGroups.set(key, [r.id]);
  }

  // Pull all predictions in one query and bin by record id. Cheaper than N
  // round trips even for large datasets; the worker is short-lived anyway.
  const predRows = db
    .select({
      recordId: predictions.recordId,
      label: predictions.label,
      confidence: predictions.confidence,
    })
    .from(predictions)
    .all();
  const predsByRecord = new Map<string, { label: string; confidence: number | null }[]>();
  for (const p of predRows) {
    const list = predsByRecord.get(p.recordId);
    if (list) list.push({ label: p.label, confidence: p.confidence });
    else predsByRecord.set(p.recordId, [{ label: p.label, confidence: p.confidence }]);
  }

  const pending: ComputedIssueInput[] = [];
  let processed = 0;

  for (const r of recordRows) {
    if (processed % BATCH_SIZE === 0 && processed > 0 && isCancelled()) {
      return { written: 0, cancelled: true };
    }

    const preds = predsByRecord.get(r.id) ?? [];

    if (lowConfEnabled) {
      let recordHasLowConfidence = false;
      let bestScore = 0;
      for (const p of preds) {
        const score = lowConfidenceScore(p.confidence, threshold);
        if (score !== null && score > bestScore) {
          bestScore = score;
          recordHasLowConfidence = true;
        }
      }
      if (recordHasLowConfidence) {
        pending.push({ recordId: r.id, type: "low_confidence", score: bestScore });
      }
    }

    if (disagreementEnabled) {
      const labels = preds.map((p) => p.label);
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
    // batched bulk insert
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      insertComputedIssues(tx, pending.slice(i, i + BATCH_SIZE));
    }
  });

  return { written: pending.length, cancelled: false };
}
