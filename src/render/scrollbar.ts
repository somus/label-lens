import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import { Text } from "./text.ts";
import { resolveTheme } from "./theme.ts";

/**
 * Right-edge mini scrollbar. 1ch wide, spans body height. Renders a column of
 * `│` chars in `fg.accentDeep` for the total track, with the visible window
 * painted as `▊` chars in `fg.accent`. Plan F3.
 *
 * Caller supplies viewport height in rows and the scroll position. Output is a
 * column Box ready to compose at the right edge of a content area via flex.
 */
export function Scrollbar(props: {
  display: ResolvedDisplay;
  total: number;
  visible: number;
  scrollTop: number;
}): ReturnType<typeof Box> {
  const { display, total, visible, scrollTop } = props;
  const rich = display.color === "truecolor" || display.color === "256";
  const t = resolveTheme(display);
  const trackRows = visible;

  if (total <= visible) {
    // No overflow — render an invisible spacer column so the layout doesn't
    // collapse and reflow.
    return Box(
      { flexDirection: "column", width: 1, flexShrink: 0 },
      ...Array.from({ length: trackRows }, () => Text({ content: " " })),
    );
  }

  const thumbSize = Math.max(1, Math.round((visible / total) * trackRows));
  const maxScroll = total - visible;
  const thumbStart =
    maxScroll > 0 ? Math.round((scrollTop / maxScroll) * (trackRows - thumbSize)) : 0;
  const thumbEnd = thumbStart + thumbSize;

  const rows = Array.from({ length: trackRows }, (_, i) => {
    const inThumb = i >= thumbStart && i < thumbEnd;
    if (rich) {
      return Text({
        content: inThumb ? "▊" : "│",
        fg: inThumb ? t.fg.accent : t.fg.accentDeep,
      });
    }
    return Text({ content: inThumb ? "#" : "|" });
  });

  return Box({ flexDirection: "column", width: 1, flexShrink: 0 }, ...rows);
}
