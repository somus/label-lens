import type { TextChunk } from "@opentui/core";
import { bold as boldFn, dim as dimFn, fg as fgFn, StyledText } from "@opentui/core";
import { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { Text, TextAttributes } from "../text.ts";
import { resolveTheme } from "../theme.ts";

export type Tone = "default" | "muted" | "dim" | "accent" | "bold" | "warning" | "danger";

export type Segment = {
  text: string;
  tone?: Tone;
};

function chunkFor(seg: Segment, display: ResolvedDisplay): TextChunk {
  const tokens = resolveTheme(display);
  const tone = seg.tone ?? "default";
  const supportsFg = display.color === "truecolor" || display.color === "256";

  switch (tone) {
    case "default":
      return supportsFg
        ? fgFn(tokens.fg.default)(seg.text)
        : ({ __isChunk: true, text: seg.text } as TextChunk);
    case "muted":
      return supportsFg ? fgFn(tokens.fg.muted)(seg.text) : dimFn(seg.text);
    case "dim":
      return supportsFg ? fgFn(tokens.fg.dim)(seg.text) : dimFn(seg.text);
    case "accent":
      return supportsFg ? boldFn(fgFn(tokens.fg.accent)(seg.text)) : boldFn(seg.text);
    case "bold":
      return boldFn(seg.text);
    case "warning":
      return supportsFg ? boldFn(fgFn(tokens.fg.warning)(seg.text)) : boldFn(seg.text);
    case "danger":
      return supportsFg ? boldFn(fgFn(tokens.fg.danger)(seg.text)) : boldFn(seg.text);
  }
}

export function segmentsToStyledText(segs: Segment[], display: ResolvedDisplay): StyledText {
  return new StyledText(segs.map((seg) => chunkFor(seg, display)));
}

export type StatusBarProps = {
  display: ResolvedDisplay;
  left: Segment[];
  right?: Segment[];
};

/**
 * Top chrome strip. Left + right clusters in a single row with space-between.
 * Each cluster is one Text node holding a StyledText so segments don't wrap
 * mid-cluster on narrow terminals — OpenTUI wraps per-Text, not per-chunk.
 */
export function StatusBar(props: StatusBarProps): ReturnType<typeof Box> {
  const { display, left, right } = props;
  const leftText = Text({
    content: segmentsToStyledText(left, display),
    attributes: TextAttributes.NONE,
    wrapMode: "word",
  });
  const rightText = right
    ? Text({
        content: segmentsToStyledText(right, display),
        attributes: TextAttributes.NONE,
        wrapMode: "word",
      })
    : Box({});
  return Box(
    {
      flexDirection: "row",
      justifyContent: "space-between",
      flexShrink: 0,
    },
    leftText,
    rightText,
  );
}
