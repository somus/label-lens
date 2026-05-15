import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import type { Segment } from "./chrome/status-bar.ts";
import { segmentsToStyledText } from "./chrome/status-bar.ts";
import { Text, TextAttributes } from "./text.ts";

/**
 * Inset-boxed title header. Single row: `══ Title ═════════════════════`
 * + a trailing blank row so callers don't repeat the spacer.
 *
 * At truecolor/256: dashes in `fg.accentDeep`, title in `fg.accent`.
 * At 16/mono: bold title + ASCII `==` dashes (fallback for terminals
 * that don't render `═` cleanly).
 */
export function ModalHeader(props: {
  display: ResolvedDisplay;
  title: string;
  innerWidth: number;
}): ReturnType<typeof Box> {
  const { display, title, innerWidth } = props;
  const rich = display.color === "truecolor" || display.color === "256";
  const dash = rich ? "═" : "=";
  // Lead is fixed at 2 dashes so the header reads as a left-anchored
  // section heading; tail fills the remaining width.
  const leadDashes = `${dash}${dash}`;
  const titleText = ` ${title} `;
  const used = 1 + leadDashes.length + titleText.length;
  const tailDashes = dash.repeat(Math.max(1, innerWidth - used));

  const segs: Segment[] = [
    { text: " ", tone: "default" },
    { text: leadDashes, tone: "accentDeep" },
    { text: titleText, tone: "accent" },
    { text: tailDashes, tone: "accentDeep" },
  ];

  return Box(
    { flexDirection: "column" },
    Text({
      content: segmentsToStyledText(segs, display),
      attributes: rich ? TextAttributes.NONE : TextAttributes.BOLD,
    }),
    Text({ content: "" }),
  );
}

/**
 * Per-kind modal-width helper (plan C3).
 *   palette / filter-builder / stats     → 60% target, max(50, min(80, w·0.6))
 *   picker                               → auto-fit, max 50% of width
 *   note                                 → 50% target, min 40ch
 *   help / guidelines                    → 80% target
 */
export type ModalKind =
  | "palette"
  | "picker"
  | "note"
  | "help"
  | "guidelines"
  | "filter-builder"
  | "stats";

export function modalWidth(
  kind: ModalKind,
  terminalWidth: number,
  hintContentWidth?: number,
): number {
  switch (kind) {
    case "palette":
    case "filter-builder":
    case "stats":
      return Math.max(50, Math.min(80, Math.floor(terminalWidth * 0.6)));
    case "picker": {
      const target = hintContentWidth !== undefined ? hintContentWidth + 6 : 32;
      const cap = Math.floor(terminalWidth * 0.5);
      return Math.max(30, Math.min(cap, target));
    }
    case "note":
      return Math.max(40, Math.floor(terminalWidth * 0.5));
    case "help":
    case "guidelines":
      return Math.max(60, Math.floor(terminalWidth * 0.8));
  }
}
