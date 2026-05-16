import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import type { Segment } from "./chrome/status-bar.ts";
import { segmentsToStyledText } from "./chrome/status-bar.ts";
import { Text, TextAttributes } from "./text.ts";

/**
 * Centered empty-state primitive: glyph + bold message + dim hint.
 * Used for all-reviewed, queue-empty, no-records states (plan H1).
 *
 * Renders inside a flexGrow:1 box with centered content so it fills the
 * available band region. Glyph color carries the state's feel (accent for
 * positive, dim for absent, warning for error).
 */
export function EmptyState(props: {
  display: ResolvedDisplay;
  glyph: string;
  glyphTone?: Segment["tone"];
  message: string;
  hint?: string;
}): ReturnType<typeof Box> {
  const { display, glyph, glyphTone = "accent", message, hint } = props;

  const lines: ReturnType<typeof Text>[] = [
    Text({
      content: segmentsToStyledText(
        [
          { text: " ".repeat(2), tone: "default" },
          { text: glyph, tone: glyphTone },
          { text: "  ", tone: "default" },
          { text: message, tone: "default" },
        ],
        display,
      ),
      attributes: TextAttributes.BOLD,
    }),
  ];
  if (hint) {
    lines.push(Text({ content: "" }));
    lines.push(
      Text({
        content: `   ${hint}`,
        attributes: TextAttributes.DIM,
      }),
    );
  }

  return Box(
    {
      flexDirection: "column",
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "flex-start",
      paddingLeft: 2,
    },
    ...lines,
  );
}
