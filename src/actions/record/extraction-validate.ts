import type { ExtractionField } from "../../config/config.ts";
import { decodeExtractionObject } from "../../labels/extraction-object.ts";

/**
 * Returns the names of required fields that are null in `text`. Used by
 * `accept` (and any future commit gate) to refuse decisions that would
 * store an invalid extraction Annotation. Malformed storage decodes to
 * an all-null object (lenient decoder), so accept fails safely rather
 * than silently writing a corrupt row.
 *
 * Empty strings are not checked: `canonicalizeExtractionObject` and the
 * form's `commitEditValue` trim blanks to `null` before storage, so
 * `""` never reaches this check via supported paths.
 */
export function missingRequiredFields(text: string, fields: ExtractionField[]): string[] {
  const decoded = decodeExtractionObject(text, fields);
  const missing: string[] = [];
  for (const f of fields) {
    if (!f.required) continue;
    if (decoded[f.name] === null) missing.push(f.name);
  }
  return missing;
}
