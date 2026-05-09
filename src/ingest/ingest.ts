import type { Database } from "bun:sqlite";
import type { FieldMap } from "../config/inference.ts";
import { insertRecord } from "../store/records.ts";
import type { InputPrediction, InputRecord } from "../types.ts";
import { contentHashId } from "./id.ts";
import { streamJsonl } from "./jsonl.ts";

export type IngestResult = {
  ingested: number;
  skipped: number;
};

export async function ingestFile(
  db: Database,
  filePath: string,
  fields: FieldMap,
): Promise<IngestResult> {
  let ingested = 0;
  let skipped = 0;
  let rowIndex = 0;

  const tx = db.transaction(
    (
      batch: {
        record: Parameters<typeof insertRecord>[1];
      }[],
    ) => {
      for (const item of batch) insertRecord(db, item.record);
    },
  );

  let buffer: { record: Parameters<typeof insertRecord>[1] }[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    tx(buffer);
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

    const predictions = collectPredictions(input);
    buffer.push({
      record: {
        id,
        source_path: filePath,
        row_index: rowIndex++,
        text: input.text,
        context_before: input.context_before ?? null,
        context_after: input.context_after ?? null,
        raw,
        predictions: predictions.map((p) => ({
          label: typeof p.label === "string" ? p.label : JSON.stringify(p.label),
          confidence: typeof p.confidence === "number" ? p.confidence : null,
          source: p.source,
          reason: p.reason ?? null,
          raw: JSON.stringify(p),
        })),
      },
    });
    ingested++;
    if (buffer.length >= 500) flush();
  }
  flush();

  return { ingested, skipped };
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

function collectPredictions(input: InputRecord): InputPrediction[] {
  return input.predictions ?? [];
}
