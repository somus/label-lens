import { bg as bgFn, fg as fgFn, StyledText, type TextChunk } from "@opentui/core";
import {
  DEFAULT_STATS_PAGE_SIZE,
  type StatsOverlayState,
  withStatsPageSize,
} from "../overlay/stats-overlay.ts";
import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import type { Segment } from "./chrome/index.ts";
import { segmentsToStyledText } from "./chrome/status-bar.ts";
import { ModalHeader } from "./modal-frame.ts";
import { Scrollbar } from "./scrollbar.ts";
import { Text, TextAttributes } from "./text.ts";
import { borderForRole, resolveTheme } from "./theme.ts";

function statsModalHeight(termHeight: number): number {
  const topOffset = Math.max(1, Math.floor(termHeight * 0.12));
  return Math.max(12, termHeight - topOffset * 2 - 2);
}

export function statsVisibleRows(summaryGroups: number, termHeight: number): number {
  const modalHeight = statsModalHeight(termHeight);
  const summaryRows = summaryGroups > 0 ? summaryGroups + 1 : 0;
  // Visible rows track the actual modal body. The Scrollbar's `total <=
  // visible` branch renders an empty spacer column, so a tall terminal with
  // few stats lines auto-hides the scrollbar (matches the help overlay).
  // Short terminals stay scrollable because visible shrinks below total.
  // Floor at 1 so the slice math never underflows.
  return Math.max(1, modalHeight - summaryRows - 8);
}

export function renderStatsOverlay(
  state: StatsOverlayState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  const modalWidth = Math.max(50, Math.min(80, Math.floor(termWidth * 0.7)));
  const innerWidth = Math.max(40, modalWidth - 4);
  const visibleRows = statsVisibleRows(state.summary.length, termHeight);
  const viewState = withStatsPageSize(state, visibleRows);
  const visible = viewState.lines.slice(viewState.scroll, viewState.scroll + visibleRows);
  const more = viewState.lines.length - viewState.scroll - visible.length;

  return modalBox(
    display,
    termWidth,
    termHeight,
    modalWidth,
    `Stats${more > 0 ? `   (+${more} more)` : ""}`,
    statsSummary(viewState, innerWidth, display),
    Box(
      { flexDirection: "row", flexGrow: 1, overflow: "hidden" },
      Box(
        { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
        ...visible.flatMap((line, offset) => {
          const index = viewState.scroll + offset;
          if (line.kind === "section-header") {
            return [sectionHeaderRow(line.label, innerWidth, display)];
          }
          return [
            statRow(
              line.display,
              line.drillTo !== null,
              index === viewState.highlight,
              innerWidth,
              display,
            ),
          ];
        }),
      ),
      Scrollbar({
        display,
        total: viewState.lines.length,
        visible: visibleRows,
        scrollTop: viewState.scroll,
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
  const modalHeight = statsModalHeight(termHeight);
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

function statsSummary(
  state: StatsOverlayState,
  innerWidth: number,
  display: ResolvedDisplay,
): ReturnType<typeof Box> {
  if (state.summary.length === 0) return Box({});
  return Box(
    { flexDirection: "column", flexShrink: 0, width: innerWidth, marginBottom: 1 },
    ...state.summary.map((group) => {
      const chunks: Segment[] = [{ text: ` ${group.label}: `, tone: "muted" }];
      group.items.forEach((item, index) => {
        if (index > 0) chunks.push({ text: "  ", tone: "dim" });
        chunks.push(
          { text: titleCase(item.label), tone: "dim" },
          { text: ` ${item.count}`, tone: "default" },
        );
      });
      return Box(
        { flexDirection: "row", width: innerWidth, height: 1, overflow: "hidden" },
        Text({
          content: segmentsToStyledText(chunks, display),
          wrapMode: "char",
        }),
      );
    }),
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
