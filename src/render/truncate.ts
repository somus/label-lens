/**
 * Truncation helpers. Per-kind rules:
 *
 * - **Labels + sources**: truncate-at-end. The namespace prefix (`llm:`, `policy:`)
 *   carries identity; tails (timestamps, version suffixes) are less informative.
 * - **Paths**: truncate-in-middle. Filename + leaf directories are the
 *   identifying part; the deep root rarely matters in display.
 * - **Note text**: truncate-at-end + caller appends "(press n for full)".
 */

const ELLIPSIS = "…";

export function truncateEnd(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  if (max <= 1) return ELLIPSIS;
  return s.slice(0, max - 1) + ELLIPSIS;
}

export function truncateMiddle(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  if (max <= 3) return ELLIPSIS;
  // Keep last segment intact (filename), drop interior. e.g.
  // `~/very/long/path/to/dataset.jsonl` @ 24 →
  // `~/…/to/dataset.jsonl`  (head=`~/`, tail=`/to/dataset.jsonl`)
  const tailHint = lastPathSegments(s, Math.max(8, max - 4));
  if (tailHint.length + 4 <= max) {
    const headBudget = max - tailHint.length - ELLIPSIS.length - 1; // 1 for `/`
    const head = s.slice(0, Math.max(1, headBudget));
    return `${head}${ELLIPSIS}/${tailHint}`;
  }
  // Tail alone bigger than budget — drop tail prefix, end-truncate.
  return ELLIPSIS + s.slice(-(max - 1));
}

/** Return the last N characters of `s` aligned to a `/` boundary if one exists in range. */
function lastPathSegments(s: string, budget: number): string {
  if (s.length <= budget) return s;
  const slice = s.slice(-budget);
  const slashAt = slice.indexOf("/");
  return slashAt === -1 ? slice : slice.slice(slashAt + 1);
}
