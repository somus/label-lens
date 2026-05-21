/**
 * Multi-label set helpers. Used wherever a label *set* (rather than a single
 * label) crosses a boundary: ingest normalisation, picker commit, queue
 * predicates, export. Storage shape is opaque text — these helpers are the
 * encode/decode pair so the schema stays unchanged.
 */

export type NormalizeResult = {
  set: string[];
  dropped: string[];
  duplicates: string[];
};

export function encodeLabelSet(labels: string[]): string {
  return JSON.stringify(labels);
}

export function decodeLabelSet(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === "string");
}

/**
 * Strict counterpart to `decodeLabelSet`. Used by export, where silently
 * coercing malformed storage to `[]` would emit a wrong dataset. Throws
 * `Error` on non-JSON, non-array, or arrays with non-string elements.
 *
 * Error messages intentionally do not embed the offending `text` — the
 * stored value may be large or sensitive; callers (e.g. `validateExportLabelSet`)
 * prefix the record id so the failure is locatable without leaking the blob.
 *
 * Empty arrays and empty-string elements are accepted by the decoder — they
 * are valid JSON shapes. Higher-layer rules (export refuses empty sets;
 * ingest/commit refuses labels outside the configured set) catch them.
 */
export function decodeLabelSetStrict(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("malformed label set: not valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("malformed label set: expected JSON array");
  }
  for (const v of parsed) {
    if (typeof v !== "string") {
      throw new Error("malformed label set: non-string element");
    }
  }
  return parsed as string[];
}

/**
 * Decode + validate a stored multi-label set for export. Wraps
 * `decodeLabelSetStrict` with the export-specific rules:
 *
 * - record-id-prefixed error messages (so the user can find the bad row),
 * - empty-set rejection (#110: empty accepted/relabeled is invalid),
 * - optional CSV separator-collision check naming the offending label.
 */
export function validateExportLabelSet(
  text: string,
  recordId: string,
  opts: { separator?: string } = {},
): string[] {
  let labels: string[];
  try {
    labels = decodeLabelSetStrict(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`record ${recordId}: ${reason}`);
  }
  if (labels.length === 0) {
    throw new Error(`record ${recordId}: empty multi-label set is invalid for export`);
  }
  if (opts.separator !== undefined) {
    const collision = labels.find((l) => l.includes(opts.separator!));
    if (collision !== undefined) {
      throw new Error(
        `record ${recordId}: label "${collision}" contains CSV separator "${opts.separator}"; change output.csvMultiLabelSeparator`,
      );
    }
  }
  return labels;
}

export function normalizeLabelSet(input: unknown, configured: string[]): NormalizeResult {
  const dropped: string[] = [];
  const duplicates: string[] = [];

  if (!Array.isArray(input)) {
    return { set: [], dropped: [input == null ? String(input) : String(input)], duplicates };
  }

  const allowed = new Set(configured);
  const order = new Map(configured.map((name, i) => [name, i]));
  const seen = new Set<string>();
  const set: string[] = [];

  for (const raw of input) {
    if (typeof raw !== "string") {
      dropped.push(String(raw));
      continue;
    }
    const trimmed = raw.trim();
    if (!allowed.has(trimmed)) {
      dropped.push(trimmed);
      continue;
    }
    if (seen.has(trimmed)) {
      duplicates.push(trimmed);
      continue;
    }
    seen.add(trimmed);
    set.push(trimmed);
  }

  set.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { set, dropped, duplicates };
}

export function labelSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  for (const v of b) if (!seen.has(v)) return false;
  return true;
}
