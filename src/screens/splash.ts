import type { CliRenderer } from "@opentui/core";
import { Box } from "../render/box.ts";
import type { ResolvedDisplay } from "../render/capability.ts";
import { Wordmark } from "../render/chrome/wordmark.ts";
import { Text, TextAttributes } from "../render/text.ts";
import { resolveTheme } from "../render/theme.ts";

/**
 * No-args splash (plan A7 + A20). Mounts when `labellens` is invoked without
 * a sub-command AND there's no `labellens.config.json` in the current
 * directory. Shows the wordmark + usage hint; any key (or ctrl+c) exits.
 *
 * Intentionally lightweight: no DB, no signals, no Chrome — boot a renderer,
 * paint two frames, listen for one keypress.
 */
export type SplashHandle = { destroy: () => void };

export function mountSplash(props: {
  renderer: CliRenderer;
  display: ResolvedDisplay;
  onExit: () => void;
}): SplashHandle {
  const { renderer, display, onExit } = props;
  const termWidth = renderer.width;
  const termHeight = renderer.height;
  const t = resolveTheme(display);

  const innerWidth = Math.min(Math.max(40, termWidth - 8), 80);
  const topPad = Math.max(2, Math.floor(termHeight * 0.18));

  const usageRows = [
    {
      command: "labellens init <file.jsonl>",
      description: "initialize a config and database in the current directory",
    },
    {
      command: "labellens",
      description: "launch review from a configured labellens directory",
    },
    {
      command: "labellens export [format]",
      description: "export reviewed records to jsonl, stats, or labelstudio",
    },
    {
      command: "labellens migrate --rename ...",
      description: "rename labels across config and stored data",
    },
    {
      command: "labellens --version",
      description: "print the installed version",
    },
  ];
  const usageLines = formatUsageRows(usageRows, termWidth);

  const node = Box(
    {
      position: "absolute",
      top: 0,
      left: 0,
      width: termWidth,
      height: termHeight,
      flexDirection: "column",
      backgroundColor: t.bg.chrome !== "transparent" ? t.bg.chrome : "black",
    },
    Box({ height: topPad }),
    Box({ flexDirection: "column", alignItems: "center" }, Wordmark({ display, innerWidth })),
    Text({ content: "" }),
    Text({
      content: centerText("terminal-first review for noisy text training data", termWidth),
      attributes: TextAttributes.DIM,
      fg: display.color === "truecolor" || display.color === "256" ? t.fg.muted : undefined,
    }),
    Text({ content: "" }),
    Text({
      content: centerText("No labellens.config.json found in this directory.", termWidth),
      attributes: TextAttributes.DIM,
      fg: display.color === "truecolor" || display.color === "256" ? t.fg.warning : undefined,
    }),
    Text({ content: "" }),
    Text({ content: "" }),
    Text({
      content: "  Usage",
      attributes: TextAttributes.BOLD,
      fg: display.color === "truecolor" || display.color === "256" ? t.fg.accent : undefined,
    }),
    Text({ content: "" }),
    ...usageLines.map((line) => fixedRow(Text({ content: line, attributes: TextAttributes.NONE }))),
    Text({ content: "" }),
    Text({
      content: "  press any key to exit",
      attributes: TextAttributes.DIM,
    }),
  );

  renderer.root.add(node);

  const handleKey = () => onExit();
  renderer.keyInput.on("keypress", handleKey);

  return {
    destroy: () => {
      renderer.keyInput.off("keypress", handleKey);
      node.destroyRecursively();
    },
  };
}

function centerText(s: string, width: number): string {
  if (s.length >= width) return s;
  const pad = width - s.length;
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + s;
}

function fixedRow(text: ReturnType<typeof Text>): ReturnType<typeof Box> {
  return Box({ height: 1, flexShrink: 0 }, text);
}

function formatUsageRows(
  rows: Array<{ command: string; description: string }>,
  terminalWidth: number,
): string[] {
  const indent = "  ";
  const commandWidth = Math.min(34, Math.max(...rows.map((r) => r.command.length)) + 4);
  const descWidth = Math.max(16, terminalWidth - indent.length - commandWidth);
  const lines: string[] = [];
  for (const row of rows) {
    const wrapped = wrapWords(row.description, descWidth);
    lines.push(`${indent}${row.command.padEnd(commandWidth)}${wrapped[0] ?? ""}`);
    for (const line of wrapped.slice(1)) {
      lines.push(`${indent}${" ".repeat(commandWidth)}${line}`);
    }
  }
  return lines;
}

function wrapWords(s: string, width: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current.length > 0) lines.push(current);
  return lines.length > 0 ? lines : [""];
}
