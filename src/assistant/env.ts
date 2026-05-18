/**
 * Per-provider env var names. Matches pi-ai's own conventions (see its
 * env-api-keys table). Centralised so both the configure overlay (which
 * tells the reviewer what to export) and the provider call (which reads
 * the actual value) agree on a single source of truth — and so older
 * config files that saved a different var name fall back cleanly.
 */
export function envVarFor(provider: string): string {
  switch (provider) {
    case "google":
      return "GEMINI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "groq":
      return "GROQ_API_KEY";
    default:
      return `${provider.toUpperCase()}_API_KEY`;
  }
}

/**
 * Resolve an API key for the provider. Tries the env var the reviewer
 * configured first (so re-launching with a stale `apiKeyEnvVar` from an
 * older wizard run still works if they exported that var), then pi-ai's
 * canonical name as a fallback. Returns the first non-empty value, or
 * undefined if neither is set.
 */
export function resolveApiKey(
  provider: string,
  apiKeyEnvVar: string | undefined,
): string | undefined {
  const candidates: string[] = [];
  if (apiKeyEnvVar) candidates.push(apiKeyEnvVar);
  const canonical = envVarFor(provider);
  if (!candidates.includes(canonical)) candidates.push(canonical);
  for (const name of candidates) {
    const val = process.env[name];
    if (val && val.length > 0) return val;
  }
  return undefined;
}
