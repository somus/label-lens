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
};

export async function inferSchema(filePath: string, sampleLimit = 100): Promise<InferenceResult> {
  const seenFields = new Set<string>();
  let sampleSize = 0;

  for await (const { value } of streamJsonl(filePath)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    for (const k of Object.keys(value)) seenFields.add(k);
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

  return {
    fields: {
      text,
      prediction: pickFirst("prediction"),
      confidence: pickFirst("confidence"),
      source: pickFirst("source"),
      context_before: pickFirst("context_before"),
      context_after: pickFirst("context_after"),
      id: pickFirst("id"),
    },
    topLevelFields: [...seenFields],
    sampleSize,
  };
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
