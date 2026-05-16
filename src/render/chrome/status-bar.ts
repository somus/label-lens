import type { TextChunk } from "@opentui/core";
import { bold as boldFn, dim as dimFn, fg as fgFn, StyledText } from "@opentui/core";
import { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { Text, TextAttributes } from "../text.ts";
import { resolveTheme } from "../theme.ts";

/**
 * Tones are the chrome's color language. To add a new tone:
 *   1. Add it to this union.
 *   2. Add a fallback case in `chunkFor` (TypeScript's exhaustiveness check
 *      will tell you where).
 *   3. Resolve via `tokens.fg.*` so capability/theme adapt automatically.
 * Mono and 16-color paths must degrade to dim/bold attributes — no `fg()`.
 */
export type Tone =
  | "default"
  | "muted"
  | "dim"
  | "accent"
  | "accentDeep"
  | "bold"
  | "success"
  | "warning"
  | "danger"
  | "info";

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
    case "accentDeep":
      return supportsFg ? fgFn(tokens.fg.accentDeep)(seg.text) : dimFn(seg.text);
    case "bold":
      return boldFn(seg.text);
    case "success":
      return supportsFg ? boldFn(fgFn(tokens.fg.success)(seg.text)) : boldFn(seg.text);
    case "warning":
      return supportsFg ? boldFn(fgFn(tokens.fg.warning)(seg.text)) : boldFn(seg.text);
    case "danger":
      return supportsFg ? boldFn(fgFn(tokens.fg.danger)(seg.text)) : boldFn(seg.text);
    case "info":
      return supportsFg ? boldFn(fgFn(tokens.fg.info)(seg.text)) : boldFn(seg.text);
    default: {
      const _exhaustive: never = tone;
      throw new Error(`unhandled tone: ${_exhaustive}`);
    }
  }
}

export function segmentsToStyledText(segs: Segment[], display: ResolvedDisplay): StyledText {
  return new StyledText(segs.map((seg) => chunkFor(seg, display)));
}

/**
 * `│` chip separator for status-bar segment composition. Callers append it
 * between logical segments (`LabelLens │ dataset │ Queues`) instead of the
 * earlier double-space dim gap, so the segments read as distinct chips.
 * Not yet adopted by every screen — kept exported so the next status-bar
 * refresh (overall-progress hint, velocity hint) can compose it consistently.
 */
export function sep(): Segment {
  return { text: " │ ", tone: "dim" };
}

export type StatusBarProps = {
  display: ResolvedDisplay;
  left: Segment[];
  right?: Segment[];
  /** Terminal width in columns. When set, the bar drops the right cluster and
   *  ellipsises left if the combined width would exceed it. */
  width?: number;
};

function segmentsText(segs: Segment[]): string {
  return segs.map((s) => s.text).join("");
}

/** Trim segments from the end until total text length fits `max`. Keeps the
 *  earliest segments (the highest-signal ones — app name, dataset, queue) and
 *  truncates the last surviving segment with an ellipsis if needed. */
function truncateSegments(segs: Segment[], max: number): Segment[] {
  if (segmentsText(segs).length <= max) return segs;
  const out: Segment[] = [];
  let used = 0;
  for (const seg of segs) {
    const remaining = max - used;
    if (remaining <= 0) break;
    if (seg.text.length <= remaining) {
      out.push(seg);
      used += seg.text.length;
      continue;
    }
    out.push({ text: `${seg.text.slice(0, Math.max(0, remaining - 1))}…`, tone: seg.tone });
    used = max;
    break;
  }
  return out;
}

/**
 * Top chrome strip. Left + right clusters in a single row with space-between.
 * Each cluster is one Text node holding a StyledText so segments don't wrap
 * mid-cluster on narrow terminals — OpenTUI wraps per-Text, not per-chunk.
 * When `width` is supplied and the two clusters would overflow, the right
 * cluster is dropped and the left cluster is truncated with an ellipsis.
 */
export function StatusBar(props: StatusBarProps): ReturnType<typeof Box> {
  const { display, width } = props;
  const leftLen = segmentsText(props.left).length;
  const rightLen = props.right ? segmentsText(props.right).length : 0;
  const narrow =
    width !== undefined &&
    (leftLen > width || (props.right !== undefined && leftLen + rightLen + 1 > width));
  const left = narrow ? truncateSegments(props.left, Math.max(8, width - 2)) : props.left;
  const right = narrow ? undefined : props.right;
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
