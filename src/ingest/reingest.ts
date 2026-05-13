import { eq, inArray } from "drizzle-orm";
import type { FieldMap } from "../config/inference.ts";
import type { Db } from "../store/db.ts";
import { insertRecord, type RecordPredictionInput } from "../store/records.ts";
import { predictions, records } from "../store/schema.ts";
import { contentHashId } from "./id.ts";
import { streamJsonl } from "./jsonl.ts";

/**
 * Pending record built from a JSONL row. Matches `insertRecord`'s shape so the
 * commit path (slice 9, applyDiff) can hand the buffered records straight to
 * the existing insert helper.
 */
export type BufferedNewRecord = {
  id: string;
  sourcePath: string;
  rowIndex: number;
  text: string;
  contextBefore: string | null;
  contextAfter: string | null;
  raw: string;
  predictions: RecordPredictionInput[];
};

export type PredictionsOnlyChange = {
  id: string;
  predictions: RecordPredictionInput[];
};

export type DiffResult = {
  predictionsOnly: PredictionsOnlyChange[];
  orphans: string[];
  newRecords: BufferedNewRecord[];
};

/**
 * Streams the new JSONL once and partitions it against `state.db`:
 *  1. existing id + same predictions → unchanged (dropped)
 *  2. existing id + different predictions → predictionsOnly bucket
 *  3. no matching id → newRecords bucket
 *  4. existing id not seen in stream → orphans bucket
 *
 * Predictions equality uses a sorted, separator-joined fingerprint to ignore
 * JSONL key ordering and prediction-array ordering. ADR 0001 + 0002.
 */
export async function diffIngest(db: Db, filePath: string, fields: FieldMap): Promise<DiffResult> {
  const existing = loadExistingFingerprints(db);

  const predictionsOnly: PredictionsOnlyChange[] = [];
  const newRecords: BufferedNewRecord[] = [];
  const seen = new Set<string>();
  let rowIndex = 0;

  for await (const { value, raw } of streamJsonl(filePath)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const obj = value as Record<string, unknown>;
    const text = obj[fields.text];
    if (typeof text !== "string" || text.length === 0) continue;

    const parsed = parseRow(obj, fields, text);
    const id =
      parsed.explicitId ?? contentHashId(parsed.text, parsed.contextBefore, parsed.contextAfter);
    seen.add(id);

    const priorFp = existing.get(id);
    if (priorFp === undefined) {
      newRecords.push({
        id,
        sourcePath: filePath,
        rowIndex: rowIndex++,
        text: parsed.text,
        contextBefore: parsed.contextBefore,
        contextAfter: parsed.contextAfter,
        raw,
        predictions: parsed.predictions,
      });
      continue;
    }
    rowIndex++;
    const newFp = predictionsFingerprint(parsed.predictions);
    if (newFp !== priorFp) {
      predictionsOnly.push({ id, predictions: parsed.predictions });
    }
  }

  const orphans: string[] = [];
  for (const id of existing.keys()) {
    if (!seen.has(id)) orphans.push(id);
  }

  return { predictionsOnly, orphans, newRecords };
}

type ParsedRow = {
  explicitId: string | null;
  text: string;
  contextBefore: string | null;
  contextAfter: string | null;
  predictions: RecordPredictionInput[];
};

function parseRow(obj: Record<string, unknown>, fields: FieldMap, text: string): ParsedRow {
  let explicitId: string | null = null;
  if (fields.id) {
    const v = obj[fields.id];
    if (typeof v === "string" && v.length > 0) explicitId = v;
  }
  let contextBefore: string | null = null;
  if (fields.context_before) {
    const v = obj[fields.context_before];
    if (typeof v === "string") contextBefore = v;
  }
  let contextAfter: string | null = null;
  if (fields.context_after) {
    const v = obj[fields.context_after];
    if (typeof v === "string") contextAfter = v;
  }

  let predictions: RecordPredictionInput[];
  const explicitPredictions = obj.predictions;
  if (Array.isArray(explicitPredictions)) {
    predictions = explicitPredictions.map((p) => coercePrediction(p));
  } else if (fields.prediction) {
    const label = obj[fields.prediction];
    if (typeof label === "string" || Array.isArray(label)) {
      const conf = fields.confidence ? obj[fields.confidence] : undefined;
      const src = fields.source ? obj[fields.source] : undefined;
      predictions = [
        coercePrediction({
          label,
          confidence: typeof conf === "number" ? conf : undefined,
          source: typeof src === "string" ? src : "unknown",
        }),
      ];
    } else {
      predictions = [];
    }
  } else {
    predictions = [];
  }

  return { explicitId, text, contextBefore, contextAfter, predictions };
}

function coercePrediction(p: unknown): RecordPredictionInput {
  const obj = (p ?? {}) as Record<string, unknown>;
  const labelRaw = obj.label;
  const label = typeof labelRaw === "string" ? labelRaw : JSON.stringify(labelRaw);
  const confidence = typeof obj.confidence === "number" ? obj.confidence : null;
  const source = typeof obj.source === "string" ? obj.source : "unknown";
  const reason = typeof obj.reason === "string" ? obj.reason : null;
  return { label, confidence, source, reason, raw: JSON.stringify(obj) };
}

/**
 * Stable fingerprint of a record's predictions[] for equality checks. Sorts
 * predictions deterministically and joins normalized field values so a
 * reorder or unrelated key shuffle doesn't trip the diff.
 */
function predictionsFingerprint(predictions: RecordPredictionInput[]): string {
  const parts = predictions
    .map((p) => `${p.label}|${p.confidence ?? ""}|${p.source}|${p.reason ?? ""}`)
    .sort();
  return parts.join("\x1e");
}

/**
 * Commit a three-bucket diff inside a single transaction:
 *  - predictionsOnly: wipe + reinsert the record's predictions rows. Reviews,
 *    tags, notes, issues are untouched.
 *  - orphans: flip records.orphan = 1. Predictions/reviews/tags stay (PRD §13
 *    "preserved, not destroyed").
 *  - newRecords: insert via the existing fresh-ingest helper.
 *
 * Caller is responsible for writing the new fingerprint row after this returns.
 */
export function applyDiff(db: Db, diff: DiffResult): void {
  db.transaction((tx) => {
    for (const change of diff.predictionsOnly) {
      tx.delete(predictions).where(eq(predictions.recordId, change.id)).run();
      for (const p of change.predictions) {
        tx.insert(predictions)
          .values({ ...p, recordId: change.id })
          .run();
      }
    }
    if (diff.orphans.length > 0) {
      const chunk = 500;
      for (let i = 0; i < diff.orphans.length; i += chunk) {
        const slice = diff.orphans.slice(i, i + chunk);
        tx.update(records).set({ orphan: true }).where(inArray(records.id, slice)).run();
      }
    }
    for (const rec of diff.newRecords) {
      insertRecord(tx, rec);
    }
  });
}

function loadExistingFingerprints(db: Db): Map<string, string> {
  const rows = db.$client
    .query(
      `SELECT r.id AS id, p.label AS label, p.confidence AS confidence,
              p.source AS source, p.reason AS reason
       FROM records r
       LEFT JOIN predictions p ON p.record_id = r.id
       WHERE r.orphan = 0`,
    )
    .all() as {
    id: string;
    label: string | null;
    confidence: number | null;
    source: string | null;
    reason: string | null;
  }[];
  const byRecord = new Map<string, RecordPredictionInput[]>();
  for (const row of rows) {
    let list = byRecord.get(row.id);
    if (!list) {
      list = [];
      byRecord.set(row.id, list);
    }
    if (row.label !== null && row.source !== null) {
      list.push({
        label: row.label,
        confidence: row.confidence,
        source: row.source,
        reason: row.reason,
        raw: "",
      });
    }
  }
  const out = new Map<string, string>();
  for (const [id, list] of byRecord) {
    out.set(id, predictionsFingerprint(list));
  }
  return out;
}
