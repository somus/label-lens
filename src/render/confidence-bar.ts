/**
 * Maps a confidence value (0..1) to a single-cell Unicode bar glyph. Used by
 * the BandedRecord left-edge marker so the user reads prediction confidence
 * at a glance — taller bar = more confident.
 *
 * The 8 levels track the Unicode block-element ramp (U+2581..U+2588). A null
 * or out-of-range confidence falls back to the plain `│` so we never lie
 * about a signal we don't have.
 */
const LEVELS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

export function confidenceGlyph(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return "│";
  if (!Number.isFinite(confidence)) return "│";
  const clamped = Math.max(0, Math.min(1, confidence));
  const idx = Math.min(LEVELS.length - 1, Math.floor(clamped * LEVELS.length));
  return LEVELS[idx] ?? "│";
}
