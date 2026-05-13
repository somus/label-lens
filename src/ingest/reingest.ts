import { eq, inArray } from "drizzle-orm";
import type { FieldMap } from "../config/inference.ts";
import type { Db } from "../store/db.ts";
import { safeIssueSource } from "../store/issues.ts";
import {
  insertRecord,
  type RecordIssueInput,
  type RecordPredictionInput,
} from "../store/records.ts";
import { predictions, records } from "../store/schema.ts";
import { contentHashId } from "./id.ts";
import { streamJsonl } from "./jsonl.ts";

/**
 * Pending record built from a JSONL row. Matches `insertRecord`'s shape so the
 * commit path (applyDiff) can hand the buffered records straight to the
 * existing insert helper — including any JSONL-imported `issues[]` so smart
 * re-ingest semantics match fresh ingest (PRD §10.4 / ADR 0002).
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
  issues: RecordIssueInput[];
};

export type PredictionsOnlyChange = {
  id: string;
  predictions: RecordPredictionInput[];
};

export type DiffResult = {
  predictionsOnly: PredictionsOnlyChange[];
  /**
   * Records that were marked orphan but whose id reappears in the new file
   * (e.g. a text edit was reverted). applyDiff flips `orphan = 0` and replaces
   * predictions to match the new file — equivalent to predictions-only refresh
   * plus un-orphan. Reviews / tags / notes survive.
   */
  revived: PredictionsOnlyChange[];
  orphans: string[];
  newRecords: BufferedNewRecord[];
};

/**
 * Streams the new JSONL once and partitions it against `state.db`:
 *  1. existing live id + same predictions → unchanged (dropped)
 *  2. existing live id + different predictions → predictionsOnly bucket
 *  3. existing orphan id → revived bucket (un-orphan + sync predictions)
 *  4. no matching id → newRecords bucket
 *  5. existing live id not seen in stream → orphans bucket
 *
 * Predictions equality uses a sorted, separator-joined fingerprint to ignore
 * JSONL key ordering and prediction-array ordering. ADR 0001 + 0002.
 */
export async function diffIngest(db: Db, filePath: string, fields: FieldMap): Promise<DiffResult> {
  const existing = loadExistingFingerprints(db);

  const predictionsOnly: PredictionsOnlyChange[] = [];
  const revived: PredictionsOnlyChange[] = [];
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

    const prior = existing.get(id);
    if (prior === undefined) {
      newRecords.push({
        id,
        sourcePath: filePath,
        rowIndex: rowIndex++,
        text: parsed.text,
        contextBefore: parsed.contextBefore,
        contextAfter: parsed.contextAfter,
        raw,
        predictions: parsed.predictions,
        issues: parsed.issues,
      });
      continue;
    }
    rowIndex++;
    if (prior.orphan) {
      revived.push({ id, predictions: parsed.predictions });
      continue;
    }
    const newFp = predictionsFingerprint(parsed.predictions);
    if (newFp !== prior.fingerprint) {
      predictionsOnly.push({ id, predictions: parsed.predictions });
    }
  }

  const orphans: string[] = [];
  for (const [id, prior] of existing) {
    if (!prior.orphan && !seen.has(id)) orphans.push(id);
  }

  return { predictionsOnly, revived, orphans, newRecords };
}

type ParsedRow = {
  explicitId: string | null;
  text: string;
  contextBefore: string | null;
  contextAfter: string | null;
  predictions: RecordPredictionInput[];
  issues: RecordIssueInput[];
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

  const issues: RecordIssueInput[] = [];
  const rawIssues = obj.issues;
  if (Array.isArray(rawIssues)) {
    for (const item of rawIssues) {
      if (typeof item !== "object" || item === null) continue;
      const i = item as Record<string, unknown>;
      const type = typeof i.type === "string" ? i.type : null;
      if (!type) continue;
      issues.push({
        type,
        score: typeof i.score === "number" ? i.score : null,
        source: safeIssueSource(typeof i.source === "string" ? i.source : null),
      });
    }
  }

  return { explicitId, text, contextBefore, contextAfter, predictions, issues };
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
 * Stable fingerprint of a record's predictions[] for equality checks. Each
 * prediction is JSON-stringified (so arbitrary characters in label/source/
 * reason can't collide with a delimiter), sorted lexicographically, and
 * joined with ASCII RS. Reorder or unrelated key shuffle doesn't trip the
 * diff.
 */
function predictionsFingerprint(predictions: RecordPredictionInput[]): string {
  const parts = predictions
    .map((p) => JSON.stringify([p.label, p.confidence ?? null, p.source, p.reason ?? null]))
    .sort();
  return parts.join("\x1e");
}

/**
 * Commit a diff inside a single transaction:
 *  - predictionsOnly: wipe + reinsert predictions. Reviews/tags/notes/issues
 *    untouched.
 *  - revived: same as predictionsOnly + flip orphan back to 0.
 *  - orphans: flip records.orphan = 1. Predictions/reviews/tags stay (PRD §13
 *    "preserved, not destroyed").
 *  - newRecords: insert via the existing fresh-ingest helper.
 *
 * Caller is responsible for writing the new fingerprint row after this returns.
 */
export function applyDiff(db: Db, diff: DiffResult): void {
  db.transaction((tx) => {
    for (const change of diff.predictionsOnly) {
      replacePredictions(tx, change);
    }
    for (const change of diff.revived) {
      replacePredictions(tx, change);
      tx.update(records).set({ orphan: false }).where(eq(records.id, change.id)).run();
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

function replacePredictions(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  change: PredictionsOnlyChange,
): void {
  tx.delete(predictions).where(eq(predictions.recordId, change.id)).run();
  for (const p of change.predictions) {
    tx.insert(predictions)
      .values({ ...p, recordId: change.id })
      .run();
  }
}

type ExistingPrior = { orphan: boolean; fingerprint: string };

function loadExistingFingerprints(db: Db): Map<string, ExistingPrior> {
  const rows = db.$client
    .query(
      `SELECT r.id AS id, r.orphan AS orphan, p.label AS label, p.confidence AS confidence,
              p.source AS source, p.reason AS reason
       FROM records r
       LEFT JOIN predictions p ON p.record_id = r.id`,
    )
    .all() as {
    id: string;
    orphan: number;
    label: string | null;
    confidence: number | null;
    source: string | null;
    reason: string | null;
  }[];
  const byRecord = new Map<string, { orphan: boolean; predictions: RecordPredictionInput[] }>();
  for (const row of rows) {
    let entry = byRecord.get(row.id);
    if (!entry) {
      entry = { orphan: row.orphan !== 0, predictions: [] };
      byRecord.set(row.id, entry);
    }
    if (row.label !== null && row.source !== null) {
      entry.predictions.push({
        label: row.label,
        confidence: row.confidence,
        source: row.source,
        reason: row.reason,
        raw: "",
      });
    }
  }
  const out = new Map<string, ExistingPrior>();
  for (const [id, entry] of byRecord) {
    out.set(id, {
      orphan: entry.orphan,
      fingerprint: predictionsFingerprint(entry.predictions),
    });
  }
  return out;
}
