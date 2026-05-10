import type { ColorInput } from "@opentui/core";
import { h, MarkdownRenderable, SyntaxStyle } from "@opentui/core";

export type MarkdownProps = {
  content: string;
  fg?: ColorInput;
  bg?: ColorInput;
};

// Allocated once for the lifetime of the process so re-renders of guidelines
// / man-page overlays don't churn the underlying SyntaxStyle resource.
let SHARED_STYLE: SyntaxStyle | null = null;
function sharedStyle(): SyntaxStyle {
  if (SHARED_STYLE === null) SHARED_STYLE = SyntaxStyle.create();
  return SHARED_STYLE;
}

export function Markdown(props: MarkdownProps) {
  return h(MarkdownRenderable, {
    content: props.content,
    syntaxStyle: sharedStyle(),
    streaming: false,
    ...(props.fg !== undefined ? { fg: props.fg } : {}),
    ...(props.bg !== undefined ? { bg: props.bg } : {}),
  });
}
