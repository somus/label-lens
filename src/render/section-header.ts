import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import { type Segment, segmentsToStyledText } from "./chrome/status-bar.ts";
import { Text, TextAttributes } from "./text.ts";

/**
 * Maximum visual length for any main-column section header / content
 * row. Callers pass the available width and the helper clamps to
 * `min(MAX_CONTENT_WIDTH, available)`. The cap exists because the
 * focus box + dashed rule both lose legibility past ~160ch — long
 * lines fight the eye, and the surrounding chrome already provides
 * structure.
 */
export const MAX_CONTENT_WIDTH = 160;

/** Backwards-compat shim — default total width when callers don't pass
 *  available space. Equals the historical fixed-80 value. */
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

/** `min(MAX_CONTENT_WIDTH, available)` clamp for callers that already
 *  know the parent's available width. */
export function clampContentWidth(available: number): number {
  return Math.max(20, Math.min(MAX_CONTENT_WIDTH, available));
}
