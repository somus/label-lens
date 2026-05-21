/**
 * Extraction-object helpers. Storage shape is opaque JSON object text in the
 * existing `predictions.label` / `reviews.final_label` / `reviews.prev_label`
 * columns; these helpers are the encode/decode/validate seam so the schema
 * stays unchanged.
 *
 * #112 supports string|null field values only. Field order in stored text
 * follows the configured `extraction.fields` order so byte-identity equality
 * works without re-parsing.
 */

import type { ExtractionField } from "../config/config.ts";

export type ExtractionObject = Record<string, string | null>;

export type NormalizeExtractionResult = {
  object: ExtractionObject;
  dropped: string[];
};

/**
 * Build a canonical extraction object from raw input keyed by configured
 * `name` in configured order. `key` aliases let ingest map source-JSON keys
 * onto canonical names. Missing / blank / non-string values become `null`.
 * Keys not present in `fields` are reported in `dropped`.
 */
export function canonicalizeExtractionObject(
  input: unknown,
  fields: ExtractionField[],
): NormalizeExtractionResult {
  const dropped: string[] = [];
  const object: ExtractionObject = {};
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    for (const f of fields) object[f.name] = null;
    return { object, dropped };
  }
  const source = input as Record<string, unknown>;
  const claimed = new Set<string>();
  for (const f of fields) {
    const sourceKey = f.key ?? f.name;
    claimed.add(sourceKey);
    const raw = source[sourceKey];
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      object[f.name] = trimmed.length === 0 ? null : trimmed;
    } else if (raw === null || raw === undefined) {
      object[f.name] = null;
    } else {
      // Numbers / booleans / nested objects are out of scope in #112; coerce
      // to null and let validateExportExtractionObject (or commit-time
      // required-field check) catch downstream.
      object[f.name] = null;
    }
  }
  for (const key of Object.keys(source)) {
    if (!claimed.has(key)) dropped.push(key);
  }
  return { object, dropped };
}

export function encodeExtractionObject(input: unknown, fields: ExtractionField[]): string {
  const { object } = canonicalizeExtractionObject(input, fields);
  // Build the JSON with keys in configured order so byte-identity equality
  // matches semantic equality.
  const ordered: ExtractionObject = {};
  for (const f of fields) ordered[f.name] = object[f.name] ?? null;
  return JSON.stringify(ordered);
}

/**
 * Lenient decoder. Returns an empty object on malformed input; non-string,
 * non-null field values are coerced to null. Used by UI / queue / decision
 * code paths where silent fallback is preferred over a crash.
 */
export function decodeExtractionObject(text: string, fields: ExtractionField[]): ExtractionObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) parsed = {};
  const source = parsed as Record<string, unknown>;
  const out: ExtractionObject = {};
  for (const f of fields) {
    const raw = source[f.name];
    if (typeof raw === "string") out[f.name] = raw;
    else out[f.name] = null;
  }
  return out;
}

/**
 * Strict decoder for export. Throws on non-JSON, non-object, or any field
 * value that is neither a string nor null. Error messages intentionally omit
 * the raw text — the stored value may be large or sensitive; the export-side
 * wrapper prefixes the record id so callers can locate the bad row.
 */
export function decodeExtractionObjectStrict(text: string): ExtractionObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("malformed extraction object: not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("malformed extraction object: expected JSON object");
  }
  const source = parsed as Record<string, unknown>;
  const out: ExtractionObject = {};
  for (const [k, v] of Object.entries(source)) {
    if (v === null) {
      out[k] = null;
    } else if (typeof v === "string") {
      out[k] = v;
    } else {
      throw new Error("malformed extraction object: field value must be string or null");
    }
  }
  return out;
}

/**
 * Decode + validate a stored extraction object for export.
 *
 * - record-id-prefixed error messages so the bad row is locatable,
 * - required-field check: any configured `required: true` field that is
 *   null/missing aborts the export.
 * - keys present in storage but not configured are passed through (extra
 *   data preserved verbatim for downstream consumers).
 */
export function validateExportExtractionObject(
  text: string,
  recordId: string,
  fields: ExtractionField[],
): ExtractionObject {
  let object: ExtractionObject;
  try {
    object = decodeExtractionObjectStrict(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`record ${recordId}: ${reason}`);
  }
  const ordered: ExtractionObject = {};
  for (const f of fields) {
    const v = object[f.name] ?? null;
    if (f.required && (v === null || v === "")) {
      throw new Error(`record ${recordId}: required extraction field "${f.name}" is empty/null`);
    }
    ordered[f.name] = v;
  }
  // Preserve unknown keys (verbatim, after configured ones).
  for (const [k, v] of Object.entries(object)) {
    if (!(k in ordered)) ordered[k] = v;
  }
  return ordered;
}

export function extractionObjectsEqual(a: ExtractionObject, b: ExtractionObject): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!(k in b)) return false;
    if ((a[k] ?? null) !== (b[k] ?? null)) return false;
  }
  return true;
}
