import { Box } from "../../../render/box.ts";
import type { ResolvedDisplay } from "../../../render/capability.ts";
import { type Segment, segmentsToStyledText } from "../../../render/chrome/status-bar.ts";
import { Text, TextAttributes } from "../../../render/text.ts";

/**
 * Queue-name section header for the top of the main column. Matches the
 * sidebar section-header pattern: `<label> ─────── <position / total>`.
 * Reads as a single row with the cursor position pinned to the right
 * edge so it never overlaps the dashes.
 */
export function QueueHeader(args: {
  display: ResolvedDisplay;
  queueLabel: string;
  position: number;
  total: number;
}): ReturnType<typeof Box> {
  const { display, queueLabel, position, total } = args;
  const positionText = total === 0 ? "0 / 0" : `${position} / ${total}`;
  // Fixed-length rule keeps the header visually stable across resizes.
  // Overflow:hidden on the parent clips when the terminal is narrower.
  const ruleLen = 60;
  const segs: Segment[] = [
    { text: ` ${queueLabel} `, tone: "accent" },
    { text: "─".repeat(ruleLen), tone: "dim" },
    { text: `  ${positionText}`, tone: "muted" },
  ];
  return Box(
    { flexDirection: "row", flexShrink: 0, overflow: "hidden" },
    Text({
      content: segmentsToStyledText(segs, display),
      attributes: TextAttributes.BOLD,
      wrapMode: "char",
    }),
  );
}
