import type { ColorInput } from "@opentui/core";
import { h, MarkdownRenderable, SyntaxStyle } from "@opentui/core";

export type MarkdownProps = {
  content: string;
  fg?: ColorInput;
  bg?: ColorInput;
};

export function Markdown(props: MarkdownProps) {
  return h(MarkdownRenderable, {
    content: props.content,
    syntaxStyle: SyntaxStyle.create(),
    streaming: false,
    ...(props.fg !== undefined ? { fg: props.fg } : {}),
    ...(props.bg !== undefined ? { bg: props.bg } : {}),
  });
}
