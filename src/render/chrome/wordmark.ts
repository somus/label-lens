import { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { quadrantTile } from "../quadrant.ts";
import { Text, TextAttributes } from "../text.ts";
import type { Segment } from "./status-bar.ts";
import { segmentsToStyledText } from "./status-bar.ts";

/**
 * LabelLens wordmark. Three rows total: hash band + brand string + hash band.
 *
 * At truecolor/256: quadrant-char hash bands in `fg.accentDeep`, brand string
 * with shade-char shoulders `░▒▓ LabelLens ▓▒░` rendered as a horizontal cyan
 * gradient (left shoulder accentDeep → text accent → right shoulder accentDeep).
 * Bold attribute on the text portion.
 *
 * At 16/mono: collapses to plain bold ` LabelLens ` between two `─` rule rows.
 *
 * Width is fixed to `innerWidth` — the band rows are filled with quadrant
 * tiles, the brand row is padded with spaces so the bands span the column.
 */
export function Wordmark(props: {
  display: ResolvedDisplay;
  innerWidth: number;
}): ReturnType<typeof Box> {
  const { display, innerWidth } = props;
  const rich = display.color === "truecolor" || display.color === "256";

  if (!rich) {
    const rule = "─".repeat(Math.max(1, innerWidth));
    return Box(
      { flexDirection: "column" },
      Text({ content: rule }),
      Text({ content: centerText(" LabelLens ", innerWidth), attributes: TextAttributes.BOLD }),
      Text({ content: rule }),
    );
  }

  const topBand = quadrantTile("▞▚", innerWidth);
  const botBand = quadrantTile("▚▞", innerWidth);

  // Build the brand row: `░▒▓ LabelLens ▓▒░` centered in innerWidth.
  const brand = "░▒▓ LabelLens ▓▒░";
  const padTotal = Math.max(0, innerWidth - brand.length);
  const padLeft = Math.floor(padTotal / 2);
  const padRight = padTotal - padLeft;
  const leftPad = " ".repeat(padLeft);
  const rightPad = " ".repeat(padRight);

  // Shoulders + text in distinct tones so the gradient reads (shade glyphs in
  // accentDeep → accent middle ramp). Text segment carries the bold attribute.
  const brandSegs: Segment[] = [
    { text: leftPad, tone: "default" },
    { text: "░▒▓ ", tone: "accentDeep" },
    { text: "LabelLens", tone: "accent" },
    { text: " ▓▒░", tone: "accentDeep" },
    { text: rightPad, tone: "default" },
  ];

  return Box(
    { flexDirection: "column" },
    Text({
      content: segmentsToStyledText([{ text: topBand, tone: "accentDeep" }], display),
    }),
    Text({ content: segmentsToStyledText(brandSegs, display) }),
    Text({
      content: segmentsToStyledText([{ text: botBand, tone: "accentDeep" }], display),
    }),
  );
}

function centerText(s: string, width: number): string {
  if (s.length >= width) return s;
  const pad = width - s.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return " ".repeat(left) + s + " ".repeat(right);
}
