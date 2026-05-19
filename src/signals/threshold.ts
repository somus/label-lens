import type { LowConfidenceConfig } from "../config/config.ts";

export const DEFAULT_LOW_CONFIDENCE = 0.5;

/**
 * Translate the validated `signals.lowConfidence` config slice into the
 * runtime resolver shape. `bySource` keys preserve their order from
 * `JSON.parse` (insertion order, per spec) so equal-specificity globs break
 * ties on config order. Missing config falls back to a `default: 0.5` /
 * empty overrides shape.
 */
export function thresholdsFromConfig(
  config: LowConfidenceConfig | undefined,
): LowConfidenceThresholds {
  if (!config) return { default: DEFAULT_LOW_CONFIDENCE, bySource: [] };
  const bySource: LowConfidenceOverride[] = [];
  if (config.bySource) {
    for (const [pattern, threshold] of Object.entries(config.bySource)) {
      bySource.push({ pattern, threshold });
    }
  }
  return { default: config.default, bySource };
}

/**
 * Per-source threshold resolution for the `low_confidence` signal.
 *
 * Resolution order:
 *   1. Exact match (pattern has no `*`, pattern === source)
 *   2. Glob match — `*` is the only wildcard; specificity = chars before the
 *      first `*`; longest specificity wins; ties resolved by config order
 *      (earlier entry wins)
 *   3. Default
 *
 * A null source skips all overrides and uses the default. PRD §10.4.
 */
export type LowConfidenceOverride = {
  pattern: string;
  threshold: number;
};

export type LowConfidenceThresholds = {
  default: number;
  bySource: LowConfidenceOverride[];
};

export function resolveThreshold(source: string | null, t: LowConfidenceThresholds): number {
  if (source === null) return t.default;

  let bestGlob: LowConfidenceOverride | null = null;
  let bestGlobSpecificity = -1;
  for (const override of t.bySource) {
    const { pattern } = override;
    const star = pattern.indexOf("*");
    if (star < 0) {
      if (pattern === source) return override.threshold;
      continue;
    }
    if (!globMatches(pattern, source)) continue;
    if (star > bestGlobSpecificity) {
      bestGlobSpecificity = star;
      bestGlob = override;
    }
  }
  return bestGlob !== null ? bestGlob.threshold : t.default;
}

function globMatches(pattern: string, source: string): boolean {
  const parts = pattern.split("*");
  if (parts.length === 1) return pattern === source;

  let cursor = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    if (part === "") {
      if (i === parts.length - 1) return true;
      continue;
    }
    if (i === 0) {
      if (!source.startsWith(part)) return false;
      cursor = part.length;
      continue;
    }
    if (i === parts.length - 1) {
      if (cursor + part.length > source.length) return false;
      return source.endsWith(part) && source.length - part.length >= cursor;
    }
    const found = source.indexOf(part, cursor);
    if (found < 0) return false;
    cursor = found + part.length;
  }
  return true;
}
