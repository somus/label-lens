import { bg as bgFn, fg as fgFn, StyledText, type TextChunk } from "@opentui/core";
import type { StatsOverlayState } from "../overlay/stats-overlay.ts";
import { Box } from "./box.ts";
import { pickSidebar, type ResolvedDisplay, sidebarWidth } from "./capability.ts";
import type { Segment } from "./chrome/index.ts";
import { segmentsToStyledText } from "./chrome/status-bar.ts";
import { ModalHeader } from "./modal-frame.ts";
import { Scrollbar } from "./scrollbar.ts";
import { Text, TextAttributes } from "./text.ts";
import { borderForRole, resolveTheme } from "./theme.ts";

const STATS_PANE_MIN_WIDTH = 40;
const STATS_PAGE = 20;

export function computeStatsPaneWidth(display: ResolvedDisplay, terminalWidth: number): number {
  const sidebarOn = pickSidebar(display, terminalWidth);
  const sidebarOverhead = sidebarWidth(terminalWidth) + 1 + 2 + 1;
  const baseOverhead = 2 + 2;
  return Math.max(
    STATS_PANE_MIN_WIDTH,
    terminalWidth - (sidebarOn ? sidebarOverhead : baseOverhead),
  );
}

export function renderStatsOverlay(
  state: StatsOverlayState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  const modalWidth = Math.max(50, Math.min(80, Math.floor(termWidth * 0.7)));
  const innerWidth = Math.max(40, modalWidth - 4);
  const visible = state.lines.slice(state.scroll, state.scroll + STATS_PAGE);
  const more = state.lines.length - state.scroll - visible.length;

  return modalBox(
    display,
    termWidth,
    termHeight,
    modalWidth,
    `Stats${more > 0 ? `   (+${more} more)` : ""}`,
    Box(
      { flexDirection: "row", flexGrow: 1, overflow: "hidden" },
      Box(
        { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
        ...visible.flatMap((line, offset) => {
          const index = state.scroll + offset;
          if (line.kind === "section-header") {
            return [Text({ content: "" }), sectionHeaderRow(line.label, innerWidth, display)];
          }
          return [
            statRow(
              line.display,
              line.drillTo !== null,
              index === state.highlight,
              innerWidth,
              display,
            ),
          ];
        }),
      ),
      Scrollbar({
        display,
        total: state.lines.length,
        visible: STATS_PAGE,
        scrollTop: state.scroll,
        caps: true,
      }),
    ),
    Text({
      content: " [j/k] navigate · [enter] drill · [esc] close",
      attributes: TextAttributes.DIM,
    }),
  );
}

function modalBox(
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
  modalWidth: number,
  title: string,
  // biome-ignore lint/suspicious/noExplicitAny: mixed VNode children.
  ...children: any[]
): ReturnType<typeof Box> {
  const border = borderForRole(display, "overlay");
  const t = resolveTheme(display);
  const overlayBg = t.bg.overlay !== "transparent" ? t.bg.overlay : "black";
  const leftOffset = Math.max(0, Math.floor((termWidth - modalWidth - 2) / 2));
  const topOffset = Math.max(1, Math.floor(termHeight * 0.12));
  const modalHeight = Math.max(12, termHeight - topOffset * 2 - 2);
  return Box(
    {
      flexDirection: "column",
      borderStyle: border,
      borderColor: t.fg.accent,
      padding: 1,
      position: "absolute",
      top: topOffset,
      left: leftOffset,
      width: modalWidth,
      height: modalHeight,
      zIndex: 100,
      shouldFill: true,
      overflow: "hidden",
      backgroundColor: overlayBg,
    },
    ModalHeader({ display, title, innerWidth: modalWidth - 4 }),
    ...children,
  );
}

function sectionHeaderRow(
  label: string,
  innerWidth: number,
  display: ResolvedDisplay,
): ReturnType<typeof Box> {
  const labelWithSpace = ` ${label} `;
  const ruleLen = Math.max(1, innerWidth - labelWithSpace.length);
  return Box(
    { flexDirection: "row", width: innerWidth, flexShrink: 0, overflow: "hidden" },
    Text({
      content: segmentsToStyledText(
        [
          { text: labelWithSpace, tone: "muted" },
          { text: "─".repeat(ruleLen), tone: "dim" },
        ],
        display,
      ),
      wrapMode: "char",
    }),
  );
}

function statRow(
  text: string,
  drillable: boolean,
  highlighted: boolean,
  innerWidth: number,
  display: ResolvedDisplay,
): ReturnType<typeof Box> {
  const theme = resolveTheme(display);
  const supportsColor = display.color === "truecolor" || display.color === "256";
  const chip = drillable ? " →" : "  ";
  const prefix = highlighted ? "> " : "  ";
  const chipExtraCells = drillable ? 1 : 0;
  const visibleLen = prefix.length + text.length + chip.length + chipExtraCells;
  const gap = Math.max(1, innerWidth - visibleLen);
  const rowText = `${prefix}${text}${" ".repeat(gap)}${chip}`;

  let inner: ReturnType<typeof Text>;
  if (highlighted && supportsColor) {
    const chunk: TextChunk = bgFn(theme.fg.accent)(fgFn(theme.bg.chrome)(rowText));
    inner = Text({
      content: new StyledText([chunk]),
      attributes: TextAttributes.BOLD,
      wrapMode: "char",
    });
  } else if (highlighted) {
    inner = Text({
      content: rowText,
      attributes: TextAttributes.BOLD | TextAttributes.INVERSE,
      wrapMode: "char",
    });
  } else {
    const tone: Segment["tone"] = drillable ? "default" : "dim";
    const chipTone: Segment["tone"] = drillable ? "accentDeep" : "dim";
    inner = Text({
      content: segmentsToStyledText(
        [
          { text: prefix, tone: "dim" },
          { text, tone },
          { text: " ".repeat(gap), tone: "default" },
          { text: chip, tone: chipTone },
        ],
        display,
      ),
      attributes: drillable ? TextAttributes.NONE : TextAttributes.DIM,
      wrapMode: "char",
    });
  }

  return Box({ flexDirection: "row", width: innerWidth, flexShrink: 0, overflow: "hidden" }, inner);
}
