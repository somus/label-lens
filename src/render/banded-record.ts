import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import { confidenceGlyph } from "./confidence-bar.ts";
import { Text, TextAttributes } from "./text.ts";
import { borderForRole, resolveTheme } from "./theme.ts";

export type BandSlot = "even" | "odd";

export type BandVariant = "queue" | "context";

export type BandedRecordProps = {
  text: string;
  isFocused: boolean;
  bandSlot: BandSlot;
  display: ResolvedDisplay;
  variant?: BandVariant;
  /** Prediction confidence (0..1). When present, drives the left-edge bar
   *  glyph so the user sees signal strength at a glance. Optional — null
   *  falls back to a plain `│`. */
  confidence?: number | null;
};

export function focusBoxStyle(display: ResolvedDisplay): "rounded" | "single" {
  return borderForRole(display, "focus") === "rounded" ? "rounded" : "single";
}

/**
 * Left-edge marker for non-focused rows. At truecolor/256 the banding
 * does the visual lift; we still surface a confidence-bar glyph when a
 * prediction confidence is available (otherwise an empty space so banding
 * tells the story). At 16-color/mono we always show a glyph because there
 * is no band tint to lean on.
 */
export function leftEdgeMarker(
  display: ResolvedDisplay,
  isFocused: boolean,
  confidence?: number | null,
): string | null {
  if (isFocused) {
    if (display.color === "truecolor" || display.color === "256") return null;
    return "▶";
  }
  const supportsBanding = display.color === "truecolor" || display.color === "256";
  const hasConfidence = typeof confidence === "number" && Number.isFinite(confidence);
  // At truecolor/256, banding does the visual lift — only surface a glyph
  // when we have an actual confidence signal to convey.
  if (supportsBanding && !hasConfidence) return null;
  return hasConfidence ? confidenceGlyph(confidence) : "│";
}

export function bandColor(display: ResolvedDisplay, slot: BandSlot): string {
  const t = resolveTheme(display);
  return slot === "even" ? t.bg.band.even : t.bg.band.odd;
}

export function accentColor(display: ResolvedDisplay): string {
  return resolveTheme(display).fg.accent;
}

export function BandedRecord(props: BandedRecordProps): ReturnType<typeof Box> {
  const { text, isFocused, bandSlot, display, variant = "queue", confidence = null } = props;
  const marker = leftEdgeMarker(display, isFocused, confidence);
  const prefix = marker === null ? "" : `${marker} `;
  const isContext = variant === "context";

  const opts: Parameters<typeof Box>[0] = {
    flexDirection: "column",
    flexShrink: 0,
    paddingLeft: 1,
    paddingRight: 1,
  };
  if (display.banding && !isContext) {
    opts.backgroundColor = bandColor(display, bandSlot);
  }
  if (isFocused) {
    opts.borderStyle = focusBoxStyle(display);
    if (display.color === "truecolor" || display.color === "256") {
      opts.borderColor = resolveTheme(display).border.focus;
    }
  }
  const attrs =
    display.color === "mono" && isFocused
      ? TextAttributes.BOLD
      : isContext
        ? TextAttributes.DIM
        : undefined;
  return Box(
    opts,
    Text({
      content: `${prefix}${text}`,
      attributes: attrs,
    }),
  );
}
