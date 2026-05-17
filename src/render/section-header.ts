import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import { type Segment, segmentsToStyledText } from "./chrome/status-bar.ts";
import { Text, TextAttributes } from "./text.ts";

/**
 * Target total visual length for every section header in the main
 * column. The label + space + rule + (optional trailing meta) collapse
 * to this width so headers stay visually aligned regardless of label
 * length. Wider than the typical 32-col sidebar so the rule reads as a
 * generous divider in the work column.
 */
const SECTION_HEADER_WIDTH = 80;

/**
 * Section header rendered like the sidebar's `Counters ─────` rule but
 * with a fixed total width so `prediction`, `labels`, `pending`, and
 * the queue-name header all line up.
 *
 * `trailing` (optional): a right-aligned chunk (e.g. `1 / 145` for the
 * queue header). Its width is reserved before computing the rule
 * length so the rule never overlaps it.
 */
export function SectionHeader(args: {
  display: ResolvedDisplay;
  label: string;
  /** Optional right-aligned suffix (e.g. position counter). */
  trailing?: Segment[];
  /** Optional total-width override. Defaults to `SECTION_HEADER_WIDTH`. */
  width?: number;
  /** Tone for the label text. Defaults to `accent`. */
  labelTone?: Segment["tone"];
}): ReturnType<typeof Box> {
  const { display, label, trailing, width = SECTION_HEADER_WIDTH, labelTone = "accent" } = args;
  const trailingWidth = trailing ? trailing.reduce((n, s) => n + s.text.length, 0) : 0;
  // Leading space (1ch) + label + 1ch gap before rule. Rule fills the rest.
  const ruleLen = Math.max(
    4,
    width - 1 - label.length - 1 - (trailingWidth > 0 ? trailingWidth + 2 : 0),
  );
  const segs: Segment[] = [
    { text: ` ${label} `, tone: labelTone },
    { text: "─".repeat(ruleLen), tone: "dim" },
  ];
  if (trailing && trailingWidth > 0) {
    segs.push({ text: "  ", tone: "dim" });
    segs.push(...trailing);
  }
  return Box(
    { flexDirection: "row", flexShrink: 0, overflow: "hidden" },
    Text({
      content: segmentsToStyledText(segs, display),
      attributes: TextAttributes.BOLD,
      wrapMode: "char",
    }),
  );
}

export { SECTION_HEADER_WIDTH };
