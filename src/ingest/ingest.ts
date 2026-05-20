import { type LabellensConfig, labelName } from "../config/config.ts";
import type { FieldMap } from "../config/inference.ts";
import { encodeLabelSet, normalizeLabelSet } from "../labels/label-set.ts";
import type { Db } from "../store/db.ts";
import { safeIssueSource } from "../store/issues.ts";
import {
  insertRecord,
  type RecordIssueInput,
  type RecordPredictionInput,
} from "../store/records.ts";
import type { InputIssue, InputPrediction, InputRecord } from "../types.ts";
import { contentHashId } from "./id.ts";
import { streamJsonl } from "./jsonl.ts";

export type IngestTaskOptions = {
  task: "classification" | "boundary" | "multi-label";
  /** Configured label names. Required for `task: "multi-label"` normalisation. */
  labels: string[];
};

export type IngestResult = {
  ingested: number;
  skipped: number;
  warnings: string[];
  /** Total warnings observed during ingest. `warnings.length` is capped at
   * `INGEST_WARNINGS_CAP` to keep memory bounded on noisy datasets. When
   * `warningCount > warnings.length`, the array is followed by a sentinel
   * row indicating how many were suppressed. */
  warningCount: number;
};

/** Cap on how many distinct warning strings we hold in memory during an
 * ingest pass. Above this, we count overflow but stop accumulating —
 * keeps a malformed dataset from growing the warnings array linearly with
 * row count. The CLI surfaces the count so the user still learns the
 * scale, just not every individual message. */
export const INGEST_WARNINGS_CAP = 200;

export function ingestTaskOptionsFromConfig(config: LabellensConfig): IngestTaskOptions {
  return {
    task: config.task,
    labels: config.labels.map(labelName),
  };
}

type PendingRecord = {
  id: string;
  sourcePath: string;
  rowIndex: number;
  text: string;
  contextBefore: string | null;
  contextAfter: string | null;
  raw: string;
  predictions: RecordPredictionInput[];
  issues: RecordIssueInput[];
};

export async function ingestFile(
  db: Db,
  filePath: string,
  fields: FieldMap,
  taskOptions?: IngestTaskOptions,
): Promise<IngestResult> {
  let ingested = 0;
  let skipped = 0;
  const warnings: string[] = [];
  let warningCount = 0;
  const recordWarning = (msg: string): void => {
    warningCount++;
    if (warnings.length < INGEST_WARNINGS_CAP) warnings.push(msg);
  };
  let rowIndex = 0;
  const multiLabel = taskOptions?.task === "multi-label";
  const configuredLabels = taskOptions?.labels ?? [];

  let buffer: PendingRecord[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    db.transaction((tx) => {
      for (const item of buffer) insertRecord(tx, item);
    });
    buffer = [];
  };

  for await (const { value, raw } of streamJsonl(filePath)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      skipped++;
      continue;
    }
    const obj = value as Record<string, unknown>;
    const text = obj[fields.text];
    if (typeof text !== "string" || text.length === 0) {
      skipped++;
      continue;
    }

    const input = mapInput(obj, fields, text);
    const id = input.id ?? contentHashId(input.text, input.context_before, input.context_after);
    const predictions = input.predictions ?? [];
    const issuesIn = input.issues ?? [];

    const normalisedPredictions: RecordPredictionInput[] = [];
    for (const p of predictions) {
      if (multiLabel) {
        if (!Array.isArray(p.label)) {
          recordWarning(
            `ingest: record ${id} source=${p.source} dropped — multi-label task requires array label, got ${typeof p.label}`,
          );
          continue;
        }
        const norm = normalizeLabelSet(p.label, configuredLabels);
        if (norm.dropped.length > 0) {
          recordWarning(
            `ingest: record ${id} source=${p.source} dropped unknown labels: ${norm.dropped.join(", ")}`,
          );
        }
        if (norm.duplicates.length > 0) {
          recordWarning(
            `ingest: record ${id} source=${p.source} deduped labels: ${norm.duplicates.join(", ")}`,
          );
        }
        normalisedPredictions.push({
          label: encodeLabelSet(norm.set),
          confidence: typeof p.confidence === "number" ? p.confidence : null,
          source: p.source,
          reason: p.reason ?? null,
          raw: JSON.stringify(p),
        });
        continue;
      }
      normalisedPredictions.push({
        label: typeof p.label === "string" ? p.label : JSON.stringify(p.label),
        confidence: typeof p.confidence === "number" ? p.confidence : null,
        source: p.source,
        reason: p.reason ?? null,
        raw: JSON.stringify(p),
      });
    }

    buffer.push({
      id,
      sourcePath: filePath,
      rowIndex: rowIndex++,
      text: input.text,
      contextBefore: input.context_before ?? null,
      contextAfter: input.context_after ?? null,
      raw,
      predictions: normalisedPredictions,
      issues: issuesIn.map((i) => ({
        type: i.type,
        score: typeof i.score === "number" ? i.score : null,
        source: safeIssueSource(typeof i.source === "string" ? i.source : null),
      })),
    });
    ingested++;
    if (buffer.length >= 500) flush();
  }
  flush();

  return { ingested, skipped, warnings, warningCount };
}

function mapInput(obj: Record<string, unknown>, fields: FieldMap, text: string): InputRecord {
  const out: InputRecord = { text };
  if (fields.id) {
    const v = obj[fields.id];
    if (typeof v === "string" && v.length > 0) out.id = v;
  }
  if (fields.context_before) {
    const v = obj[fields.context_before];
    if (typeof v === "string") out.context_before = v;
  }
  if (fields.context_after) {
    const v = obj[fields.context_after];
    if (typeof v === "string") out.context_after = v;
  }

  const explicitIssues = obj.issues;
  if (Array.isArray(explicitIssues)) {
    out.issues = explicitIssues as InputIssue[];
  }

  const explicitPredictions = obj.predictions;
  if (Array.isArray(explicitPredictions)) {
    out.predictions = explicitPredictions as InputPrediction[];
  } else if (fields.prediction) {
    const label = obj[fields.prediction];
    if (typeof label === "string" || Array.isArray(label)) {
      const conf = fields.confidence ? obj[fields.confidence] : undefined;
      const src = fields.source ? obj[fields.source] : undefined;
      out.predictions = [
        {
          label: label as string,
          confidence: typeof conf === "number" ? conf : undefined,
          source: typeof src === "string" ? src : "unknown",
        },
      ];
    }
  }
  return out;
}
