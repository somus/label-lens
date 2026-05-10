import type { LabellensConfig } from "../config/config.ts";
import type { RecordWithPrimaryPrediction } from "../types.ts";

/**
 * Resolve the document_id for a record under a boundary-task config.
 *
 * Resolution order:
 *  1. If `boundary.documentField === "document_id"` (the default), trust the
 *     view-derived `record.document_id`. The `records_with_primary` view
 *     already coalesces `$.document_id` → `$.meta.document_id` → `$.meta.doc`.
 *  2. Otherwise, parse `record.raw` JSON and look for the configured
 *     top-level field; fall back to `meta.document_id`, then `meta.doc`.
 *
 * Returns `null` when the task is not boundary, the boundary block is missing,
 * or no field resolves to a non-empty string.
 *
 * Note (slice 4): the view only indexes the default path. A custom
 * `documentField` resolves correctly per-record here, but `recordsInDoc` will
 * not find peer records by that custom value because the view's `document_id`
 * column does not include the custom JSON path. See CONTEXT.md.
 */
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
