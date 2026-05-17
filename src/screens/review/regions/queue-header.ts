import type { Box } from "../../../render/box.ts";
import type { ResolvedDisplay } from "../../../render/capability.ts";
import type { Segment } from "../../../render/chrome/status-bar.ts";
import { SectionHeader } from "../../../render/section-header.ts";

/**
 * Queue-name section header for the top of the main column. Uses the
 * shared `SectionHeader` primitive so it lines up with every other
 * section header (`prediction`, `labels`, etc.) — same total width,
 * with `<position / total>` right-aligned.
 */
export function QueueHeader(args: {
  display: ResolvedDisplay;
  queueLabel: string;
  position: number;
  total: number;
}): ReturnType<typeof Box> {
  const { display, queueLabel, position, total } = args;
  const positionText = total === 0 ? "0 / 0" : `${position} / ${total}`;
  const trailing: Segment[] = [{ text: positionText, tone: "muted" }];
  return SectionHeader({ display, label: queueLabel, trailing });
}
