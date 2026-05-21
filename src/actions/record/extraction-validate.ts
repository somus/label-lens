import type { ExtractionField } from "../../config/config.ts";
import { decodeExtractionObject } from "../../labels/extraction-object.ts";

/**
 * Returns the names of required fields that are null or empty in `text`.
 * Used by `accept` (and any future commit gate) to refuse decisions that
 * would store an invalid extraction Annotation. Malformed storage is
 * treated as "everything required is missing" so accept fails safely
 * rather than silently writing a corrupt row.
 */
export function missingRequiredFields(text: string, fields: ExtractionField[]): string[] {
  const decoded = decodeExtractionObject(text, fields);
  const missing: string[] = [];
  for (const f of fields) {
    if (!f.required) continue;
    const v = decoded[f.name];
    if (v === null || v === "") missing.push(f.name);
  }
  return missing;
}
