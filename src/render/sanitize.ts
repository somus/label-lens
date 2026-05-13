/**
 * Strip CR/LF and ASCII control characters from a string before it goes into a
 * single-row chrome surface (status bar segments, footer labels). User data
 * from JSONL can legally contain these — letting them render would corrupt
 * layout, escape attributes, or worse.
 */
export function sanitizeStatusText(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: deliberate strip.
  return s.replace(/[\x00-\x1f\x7f]/g, " ");
}
