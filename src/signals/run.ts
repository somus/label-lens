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
import { predictions, records } from "../store/schema.ts";
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

type RecordRow = { id: string; text: string };
type PrimaryByRecord = Map<string, { confidence: number | null; source: string | null }>;

/**
 * Pick the primary Prediction for each record in a single pass over the
 * predictions table. Mirrors the `records_with_primary` view's semantics
 * (PRD §11.4 + ADR 0001): highest confidence wins, NULL loses to any
 * numeric, ties broken by predictions.id ASC (earliest insertion wins).
 *
 * We compute in JS rather than reading the view because the view's window
 * function is measurably slower on the signals hot path; the view exists
 * for queue queries where the JOIN is unavoidable.
 */
function buildPrimaryMap(
  predRows: { recordId: string; confidence: number | null; source: string }[],
): PrimaryByRecord {
  const out: PrimaryByRecord = new Map();
  for (const p of predRows) {
    const cur = out.get(p.recordId);
    if (cur === undefined) {
      out.set(p.recordId, { confidence: p.confidence, source: p.source });
      continue;
    }
    const beat =
      (cur.confidence === null && p.confidence !== null) ||
      (cur.confidence !== null && p.confidence !== null && p.confidence > cur.confidence);
    if (beat) out.set(p.recordId, { confidence: p.confidence, source: p.source });
  }
  return out;
}

function computeLowConfidenceIssues(
  rows: RecordRow[],
  primaryByRecord: PrimaryByRecord,
  thresholds: LowConfidenceThresholds,
): ComputedIssueInput[] {
  const out: ComputedIssueInput[] = [];
  for (const r of rows) {
    const primary = primaryByRecord.get(r.id);
    if (!primary || primary.confidence === null) continue;
    const threshold = resolveThreshold(primary.source, thresholds);
    const score = lowConfidenceScore(primary.confidence, threshold);
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

  const recordRows = db
    .select({ id: records.id, text: records.text })
    .from(records)
    .orderBy(asc(records.rowIndex))
    .all();
  const total = recordRows.length;
  if (total === 0) return { written: 0, cancelled: false };

  const dupGroups = new Map<string, string[]>();
  if (duplicateEnabled) {
    for (const r of recordRows) {
      const key = normalize(r.text);
      const bucket = dupGroups.get(key);
      if (bucket) bucket.push(r.id);
      else dupGroups.set(key, [r.id]);
    }
  }

  // Single predictions scan feeds both the primary-prediction map (used by
  // low_confidence) and the per-record label lists (used by source_disagreement).
  // Ordering by id ASC matches the view's tie-break — earliest insertion wins.
  let primaryByRecord: PrimaryByRecord | null = null;
  let labelsByRecord: Map<string, string[]> | null = null;
  if (lowConfEnabled || disagreementEnabled) {
    const predRows = db
      .select({
        recordId: predictions.recordId,
        label: predictions.label,
        confidence: predictions.confidence,
        source: predictions.source,
      })
      .from(predictions)
      .orderBy(asc(predictions.id))
      .all();
    if (lowConfEnabled) primaryByRecord = buildPrimaryMap(predRows);
    if (disagreementEnabled) {
      labelsByRecord = new Map();
      for (const p of predRows) {
        const list = labelsByRecord.get(p.recordId);
        if (list) list.push(p.label);
        else labelsByRecord.set(p.recordId, [p.label]);
      }
    }
  }

  const pending: ComputedIssueInput[] = [];

  if (lowConfEnabled && primaryByRecord) {
    pending.push(...computeLowConfidenceIssues(recordRows, primaryByRecord, thresholds));
  }

  let processed = 0;
  for (const r of recordRows) {
    if (processed % BATCH_SIZE === 0 && processed > 0 && isCancelled()) {
      return { written: 0, cancelled: true };
    }

    if (disagreementEnabled && labelsByRecord) {
      const labels = labelsByRecord.get(r.id) ?? [];
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
  const recordRows = db
    .select({ id: records.id, text: records.text })
    .from(records)
    .orderBy(asc(records.rowIndex))
    .all();
  const predRows = db
    .select({
      recordId: predictions.recordId,
      label: predictions.label,
      confidence: predictions.confidence,
      source: predictions.source,
    })
    .from(predictions)
    .orderBy(asc(predictions.id))
    .all();
  const primaryByRecord = buildPrimaryMap(predRows);
  const pending = computeLowConfidenceIssues(recordRows, primaryByRecord, thresholds);
  db.transaction((tx: TxOrDb) => {
    purgeComputedIssuesOfType(tx, "low_confidence");
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      insertComputedIssues(tx, pending.slice(i, i + BATCH_SIZE));
    }
  });
  return { written: pending.length };
}
