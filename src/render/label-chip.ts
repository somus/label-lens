import type { LabelChipMode } from "./capability.ts";

/**
 * Resolve the chip text for a label position. `[k]` when a per-label key
 * is configured (PRD §10.1), `[N]` for the positional digit otherwise. In
 * `both` mode the chip merges to `[N/k]` when the label has both a digit
 * (positions 1-9) and a configured key.
 */
export function labelChipText(args: {
  index: number;
  key: string | null;
  mode: LabelChipMode;
}): string {
  const { index, key, mode } = args;
  const hasDigit = index >= 0 && index < 9;
  const digit = hasDigit ? String(index + 1) : null;
  if (mode === "both") {
    if (key && digit) return `[${digit}/${key}]`;
    if (key) return `[${key}]`;
    if (digit) return `[${digit}]`;
    return "";
  }
  // configured
  if (key) return `[${key}]`;
  if (digit) return `[${digit}]`;
  return "";
}
