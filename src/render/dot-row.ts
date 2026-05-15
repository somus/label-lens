import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import type { Segment } from "./chrome/status-bar.ts";
import { segmentsToStyledText } from "./chrome/status-bar.ts";
import { Text } from "./text.ts";

/**
 * Animated cyan-fading dot row for loading states (plan H2). A row of `·` chars
 * with a brightness wave running left→right. `phase` (0..1) advances the wave
 * position; caller drives it via motion controller progress or a timer.
 *
 * At truecolor/256: row in `fg.dim`, with the dot under `phase` and its two
 * neighbors highlighted (accent → accentDeep ramp). At 16/mono: static row of
 * dim dots — motion is gated off there anyway.
 */
export function DotRow(props: {
  display: ResolvedDisplay;
  width: number;
  phase: number;
}): ReturnType<typeof Box> {
  const { display, width, phase } = props;
  const rich = display.color === "truecolor" || display.color === "256";
  const w = Math.max(1, width);

  if (!rich || !display.motion) {
    // Static dim row.
    return Box(
      {},
      Text({
        content: segmentsToStyledText([{ text: "· ".repeat(w).trim(), tone: "dim" }], display),
      }),
    );
  }

  const peak = Math.floor(Math.max(0, Math.min(0.999, phase)) * w);
  const segs: Segment[] = [];
  for (let i = 0; i < w; i++) {
    const dist = Math.abs(i - peak);
    let tone: Segment["tone"] = "dim";
    if (dist === 0) tone = "accent";
    else if (dist === 1) tone = "accentDeep";
    segs.push({ text: i === w - 1 ? "·" : "· ", tone });
  }
  return Box({}, Text({ content: segmentsToStyledText(segs, display) }));
}
