import type { TextChunk } from "@opentui/core";
import { bg as bgFn, bold as boldFn, fg as fgFn, StyledText } from "@opentui/core";
import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import { Text, TextAttributes } from "./text.ts";
import { resolveTheme } from "./theme.ts";

export type BadgeVariant = "info" | "success" | "warning" | "danger" | "neutral";

const DEFAULT_ICON: Record<BadgeVariant, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  danger: "✗",
  neutral: "·",
};

export type BadgeProps = {
  display: ResolvedDisplay;
  variant: BadgeVariant;
  label: string;
  /** Override the default glyph. Pass empty string to hide the icon. */
  icon?: string;
};

function variantColors(
  display: ResolvedDisplay,
  variant: BadgeVariant,
): { fg: string; bg: string } {
  const t = resolveTheme(display);
  switch (variant) {
    case "info":
      return { fg: t.fg.info, bg: t.bg.soft.info };
    case "success":
      return { fg: t.fg.success, bg: t.bg.soft.success };
    case "warning":
      return { fg: t.fg.warning, bg: t.bg.soft.warning };
    case "danger":
      return { fg: t.fg.danger, bg: t.bg.soft.danger };
    case "neutral":
      return { fg: t.fg.muted, bg: t.bg.chrome };
  }
}

/**
 * Inline semantic indicator. Renders as a single-line StyledText so it can sit
 * inside another row without claiming its own block. At truecolor/256 the
 * badge has a soft tinted background; at 16-color/mono it degrades to colored
 * (or bold) text with the icon glyph.
 *
 * Use `BadgeLine` for one badge per row (full-width container).
 */
export function Badge(props: BadgeProps): StyledText {
  const { display, variant, label } = props;
  const icon = props.icon ?? DEFAULT_ICON[variant];
  const text = icon ? ` ${icon} ${label} ` : ` ${label} `;
  if (display.color === "mono") {
    return new StyledText([boldFn(text)]);
  }

  const { fg, bg } = variantColors(display, variant);
  if (display.color === "16") {
    // Preserve the semantic color channel — bg is transparent in the 16-color
    // palette, so we only apply fg + bold.
    return new StyledText([boldFn(fgFn(fg)(text))]);
  }

  const chunk: TextChunk = boldFn(bgFn(bg)(fgFn(fg)(text)));
  return new StyledText([chunk]);
}

export function BadgeLine(props: BadgeProps): ReturnType<typeof Box> {
  return Box(
    { flexDirection: "row", flexShrink: 0 },
    Text({ content: Badge(props), attributes: TextAttributes.NONE }),
  );
}
