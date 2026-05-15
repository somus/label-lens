/**
 * Produce `n` chars by repeating a 2-char quadrant pattern (`▞▚`, `▚▞`, etc.).
 * Shared between the modal-frame header band and the sidebar wordmark.
 */
export function quadrantTile(pattern: string, n: number): string {
  if (n <= 0) return "";
  let out = "";
  while (out.length < n) out += pattern;
  return out.slice(0, n);
}
