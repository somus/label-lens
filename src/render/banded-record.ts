import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import { Text, TextAttributes } from "./text.ts";

export type BandSlot = "even" | "odd";

export type BandedRecordProps = {
  text: string;
  isFocused: boolean;
  bandSlot: BandSlot;
  display: ResolvedDisplay;
};

export function focusBoxStyle(display: ResolvedDisplay): "rounded" | "single" {
  return display.color === "truecolor" || display.color === "256" ? "rounded" : "single";
}

export function leftEdgeMarker(display: ResolvedDisplay, isFocused: boolean): string | null {
  if (display.color === "truecolor" || display.color === "256") return null;
  return isFocused ? "▶" : "│";
}

type Palette = {
  bandEven: string;
  bandOdd: string;
  accent: string;
};

function paletteFor(display: ResolvedDisplay): Palette {
  const dark = display.theme === "dark";
  if (display.color === "truecolor") {
    return dark
      ? { bandEven: "#1f1f1f", bandOdd: "#252525", accent: "#7ec8ff" }
      : { bandEven: "#f5f5f5", bandOdd: "#ebebeb", accent: "#0066cc" };
  }
  if (display.color === "256") {
    return dark
      ? { bandEven: "#2a2a2a", bandOdd: "#3a3a3a", accent: "#7ec8ff" }
      : { bandEven: "#eaeaea", bandOdd: "#d4d4d4", accent: "#0050a0" };
  }
  return { bandEven: "transparent", bandOdd: "transparent", accent: "white" };
}

export function bandColor(display: ResolvedDisplay, slot: BandSlot): string {
  const p = paletteFor(display);
  return slot === "even" ? p.bandEven : p.bandOdd;
}

export function accentColor(display: ResolvedDisplay): string {
  return paletteFor(display).accent;
}

export function BandedRecord(props: BandedRecordProps): ReturnType<typeof Box> {
  const { text, isFocused, bandSlot, display } = props;
  const marker = leftEdgeMarker(display, isFocused);
  const prefix = marker === null ? "" : `${marker} `;

  const opts: Parameters<typeof Box>[0] = {
    flexDirection: "column",
    flexShrink: 0,
    paddingLeft: 1,
    paddingRight: 1,
  };
  if (display.banding) {
    opts.backgroundColor = bandColor(display, bandSlot);
  }
  if (isFocused) {
    opts.borderStyle = focusBoxStyle(display);
    opts.borderColor = accentColor(display);
  }

  return Box(
    opts,
    Text({
      content: `${prefix}${text}`,
      attributes: display.color === "mono" && isFocused ? TextAttributes.BOLD : undefined,
    }),
  );
}
