import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import { Text } from "./text.ts";
import { resolveTheme } from "./theme.ts";

/**
 * Right-edge mini scrollbar. 1ch wide, spans body height. Renders a column of
 * `│` chars in `fg.accentDeep` for the total track with the visible window
 * painted as `▊` chars in `fg.accent`. Optional `caps` adds `▲` / `▼` arrow
 * heads at top and bottom of the track (Basalt-style) — caps absorb 2 rows
 * from the track, so the track of thumb cells is `visible - 2`. Plan F3.
 *
 * Caller supplies viewport height in rows and the scroll position. Output is a
 * column Box ready to compose at the right edge of a content area via flex.
 */
export function Scrollbar(props: {
  display: ResolvedDisplay;
  total: number;
  visible: number;
  scrollTop: number;
  caps?: boolean;
}): ReturnType<typeof Box> {
  const { display, total, visible, scrollTop, caps = false } = props;
  const rich = display.color === "truecolor" || display.color === "256";
  const t = resolveTheme(display);
  const trackRows = caps ? Math.max(1, visible - 2) : visible;

  const capArrow = (glyph: string, asciiFallback: string, dim: boolean) => {
    if (rich) {
      return Text({ content: glyph, fg: dim ? t.fg.disabled : t.fg.accent });
    }
    return Text({ content: dim ? asciiFallback : glyph });
  };

  if (total <= visible) {
    const spacer = Array.from({ length: trackRows }, () => Text({ content: " " }));
    const children = caps ? [Text({ content: " " }), ...spacer, Text({ content: " " })] : spacer;
    return Box({ flexDirection: "column", width: 1, flexShrink: 0 }, ...children);
  }

  const thumbSize = Math.max(1, Math.round((visible / total) * trackRows));
  const maxScroll = total - visible;
  const thumbStart =
    maxScroll > 0 ? Math.round((scrollTop / maxScroll) * (trackRows - thumbSize)) : 0;
  const thumbEnd = thumbStart + thumbSize;

  const trackChildren = Array.from({ length: trackRows }, (_, i) => {
    const inThumb = i >= thumbStart && i < thumbEnd;
    if (rich) {
      return Text({
        content: inThumb ? "▊" : "│",
        fg: inThumb ? t.fg.accent : t.fg.accentDeep,
      });
    }
    return Text({ content: inThumb ? "#" : "|" });
  });

  const children = caps
    ? [
        capArrow("▲", "^", scrollTop === 0),
        ...trackChildren,
        capArrow("▼", "v", scrollTop >= maxScroll),
      ]
    : trackChildren;

  return Box({ flexDirection: "column", width: 1, flexShrink: 0 }, ...children);
}
