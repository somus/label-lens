import type { ResolvedDisplay } from "./capability.ts";

const BLOCK_FILLED = "█";
const BLOCK_EMPTY = "░";
const ASCII_FILLED = "#";
const ASCII_EMPTY = "-";

function glyphsFor(display: ResolvedDisplay): { filled: string; empty: string } {
  if (display.color === "truecolor" || display.color === "256") {
    return { filled: BLOCK_FILLED, empty: BLOCK_EMPTY };
  }
  return { filled: ASCII_FILLED, empty: ASCII_EMPTY };
}

/**
 * Pure char-only progress bar. Returns `width` glyphs reflecting `filled / total`.
 * Callers wrap with brackets / tones as needed.
 *
 * Edge guards: total <= 0 → all-empty; width <= 0 → empty string; ratio clamped to [0, 1].
 */
export function progressBar(
  filled: number,
  total: number,
  width: number,
  display: ResolvedDisplay,
): string {
  if (width <= 0) return "";
  const { filled: f, empty: e } = glyphsFor(display);
  if (total <= 0) return e.repeat(width);
  const ratio = Math.max(0, Math.min(1, filled / total));
  const cells = Math.round(ratio * width);
  return f.repeat(cells) + e.repeat(width - cells);
}
