import type { ResolvedDisplay } from "./capability.ts";
import type { Segment } from "./chrome/status-bar.ts";
import { progressBar } from "./progress-bar.ts";

/**
 * Compose a bracketed progress bar + percent label as toned segments.
 * Bar tone is `accent` when any cells are filled, `dim` when empty so a
 * row of empty queues fades quietly without losing the marker.
 */
export function progressSegments(
  filled: number,
  total: number,
  width: number,
  display: ResolvedDisplay,
): Segment[] {
  const bar = progressBar(filled, total, width, display);
  const ratio = total > 0 ? Math.max(0, Math.min(1, filled / total)) : 0;
  const percent = Math.round(ratio * 100);
  const barTone = filled > 0 && total > 0 ? "accent" : "dim";
  // Percent padded to 4 chars (`  0%` … `100%`) so callers laying out rows with
  // varying counts get aligned bracket + bar columns. Trailing `%` after the
  // padded digits keeps the unit glued to the number.
  const percentText = `${String(percent).padStart(3, " ")}%`;
  return [
    { text: "[", tone: "dim" },
    { text: bar, tone: barTone },
    { text: "] ", tone: "dim" },
    { text: percentText, tone: "muted" },
  ];
}
