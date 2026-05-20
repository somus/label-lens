// Keep in sync with PRD §11.1 InputRecord. When that type gains a field, add
// it here too so the new key doesn't leak through into the exported `meta`.
// `meta` itself is also stripped — if input had a top-level `meta` object it
// is returned directly (verbatim) per PRD §11.1; we never nest it inside
// another `meta` wrapper.
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
  "meta",
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
  const obj = parsed as Record<string, unknown>;
  // Canonical form: input has a top-level `meta` object — use it verbatim.
  const canonical = obj.meta;
  if (canonical !== null && typeof canonical === "object" && !Array.isArray(canonical)) {
    return canonical as Record<string, unknown>;
  }
  // Fallback: bundle non-canonical top-level extras (e.g. user_id, tags).
  const out: Record<string, unknown> = {};
  let any = false;
  for (const [key, value] of Object.entries(obj)) {
    if (KNOWN_INPUT_FIELDS.has(key)) continue;
    out[key] = value;
    any = true;
  }
  return any ? out : undefined;
}
