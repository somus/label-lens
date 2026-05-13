const KNOWN_INPUT_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "text",
  "context_before",
  "context_after",
  "predictions",
  "prediction",
  "confidence",
  "source",
  "reason",
  "issues",
  "label",
]);

export function projectMeta(raw: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  let any = false;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (KNOWN_INPUT_FIELDS.has(key)) continue;
    out[key] = value;
    any = true;
  }
  return any ? out : undefined;
}
