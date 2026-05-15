import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import type { Segment } from "./chrome/status-bar.ts";
import { segmentsToStyledText } from "./chrome/status-bar.ts";
import { quadrantTile } from "./quadrant.ts";
import { Text, TextAttributes } from "./text.ts";

/**
 * Quadrant-fill header bar primitive. A full-row band of `▞▚` quadrant chars
 * with the title overlaid centered. Locked in plan C1 — replaces the plain
 * bold title row that overlays previously used.
 *
 * At truecolor/256: band chars in `fg.accentDeep`, title in `fg.accent` bold.
 * At 16/mono: collapses to plain bold title + `─────` underline row.
 *
 * Returns a Box with one (rich) or two (mono fallback) rows.
 */
export function ModalHeader(props: {
  display: ResolvedDisplay;
  title: string;
  innerWidth: number;
}): ReturnType<typeof Box> {
  const { display, title, innerWidth } = props;
  const rich = display.color === "truecolor" || display.color === "256";

  if (!rich) {
    // Mono / 16-color fallback: single bold title row. Dropped the
    // dashed underline so the modal body keeps a row of headroom — at
    // typical terminal heights the quadrant header eats space we can't
    // spare without clipping the entry list.
    return Box(
      { flexDirection: "column" },
      Text({ content: ` ${title}`, attributes: TextAttributes.BOLD }),
    );
  }

  // Build the band row: quadrant chars across innerWidth, with the centered
  // ` title ` substring carved out and rendered in accent bold.
  const titleText = ` ${title} `;
  const titleLen = titleText.length;
  const tileLen = Math.max(0, innerWidth - titleLen);
  const leftLen = Math.floor(tileLen / 2);
  const rightLen = tileLen - leftLen;
  const leftTile = quadrantTile("▞▚", leftLen);
  const rightTile = quadrantTile("▞▚", rightLen);

  const segs: Segment[] = [
    { text: leftTile, tone: "accentDeep" },
    { text: titleText, tone: "accent" },
    { text: rightTile, tone: "accentDeep" },
  ];

  return Box({ flexDirection: "row" }, Text({ content: segmentsToStyledText(segs, display) }));
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
