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
