import type { LabellensConfig } from "../config/config.ts";
import type { RecordWithPrimaryPrediction } from "../types.ts";

export function resolveDocumentId(
  record: RecordWithPrimaryPrediction | null,
  config: LabellensConfig,
): string | null {
  if (!record || config.task !== "boundary" || !config.boundary) return null;
  const field = config.boundary.documentField;
  if (field === "document_id") {
    return record.document_id ?? null;
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    const v = JSON.parse(record.raw);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      parsed = v as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  if (!parsed) return null;
  const top = parsed[field];
  if (typeof top === "string" && top.length > 0) return top;
  const meta = parsed.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const m = meta as Record<string, unknown>;
    if (typeof m.document_id === "string" && m.document_id.length > 0) return m.document_id;
    if (typeof m.doc === "string" && m.doc.length > 0) return m.doc;
  }
  return null;
}
