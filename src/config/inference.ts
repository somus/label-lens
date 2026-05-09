import { streamJsonl } from "../ingest/jsonl.ts";

export type FieldMap = {
  text: string;
  prediction?: string;
  confidence?: string;
  source?: string;
  context_before?: string;
  context_after?: string;
  id?: string;
};

const CANDIDATES: Record<keyof FieldMap, string[]> = {
  text: ["text", "content", "body", "message", "description", "line", "input"],
  prediction: [
    "prediction",
    "predicted_label",
    "label",
    "llm_label",
    "predicted",
    "category",
    "class",
  ],
  confidence: ["confidence", "score", "probability", "prob", "llm_confidence", "pred_confidence"],
  source: ["source", "prediction_source", "label_source", "model", "predictor"],
  context_before: ["context_before", "before", "prev", "previous", "previous_text"],
  context_after: ["context_after", "after", "next", "next_text"],
  id: ["id", "uuid", "record_id", "_id"],
};

export type InferenceResult = {
  fields: FieldMap;
  topLevelFields: string[];
  sampleSize: number;
  /** Distinct prediction labels seen in the sample, ordered by descending frequency. */
  labels: string[];
};

export async function inferSchema(filePath: string, sampleLimit = 100): Promise<InferenceResult> {
  const seenFields = new Set<string>();
  const samples: Record<string, unknown>[] = [];
  let sampleSize = 0;

  for await (const { value } of streamJsonl(filePath)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    for (const k of Object.keys(value)) seenFields.add(k);
    samples.push(value as Record<string, unknown>);
    sampleSize++;
    if (sampleSize >= sampleLimit) break;
  }

  const pickFirst = (concept: keyof FieldMap): string | undefined => {
    for (const candidate of CANDIDATES[concept]) {
      if (seenFields.has(candidate)) return candidate;
    }
    return undefined;
  };

  const text = pickFirst("text");
  if (!text) {
    throw new InferenceError(
      `Could not infer 'text' field from sample of ${sampleSize} records.\nAvailable top-level fields: ${[...seenFields].join(", ")}`,
      [...seenFields],
    );
  }

  const predictionField = pickFirst("prediction");
  const labels = collectLabels(samples, predictionField);

  return {
    fields: {
      text,
      prediction: predictionField,
      confidence: pickFirst("confidence"),
      source: pickFirst("source"),
      context_before: pickFirst("context_before"),
      context_after: pickFirst("context_after"),
      id: pickFirst("id"),
    },
    topLevelFields: [...seenFields],
    sampleSize,
    labels,
  };
}

function collectLabels(
  samples: Record<string, unknown>[],
  predictionField: string | undefined,
): string[] {
  const counts = new Map<string, number>();
  const bump = (label: unknown) => {
    if (typeof label !== "string" || label.length === 0) return;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  };
  for (const row of samples) {
    if (predictionField && predictionField in row) bump(row[predictionField]);
    const preds = row.predictions;
    if (Array.isArray(preds)) {
      for (const p of preds) {
        if (p && typeof p === "object" && "label" in p) bump((p as { label: unknown }).label);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k);
}

export class InferenceError extends Error {
  constructor(
    message: string,
    public readonly availableFields: string[],
  ) {
    super(message);
    this.name = "InferenceError";
  }
}
