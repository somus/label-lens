import { bold as boldFn, dim as dimFn, fg as fgFn, StyledText } from "@opentui/core";
import { type FilterBuilderState, selectedValues } from "../overlay/filter-builder.ts";
import { BUILDER_COLUMNS, operatorsForColumn } from "../store/queues/predicate.ts";
import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import { ModalHeader } from "./modal-frame.ts";
import { Text, TextAttributes } from "./text.ts";
import { borderForRole, resolveTheme } from "./theme.ts";

export function renderFilterBuilder(
  state: FilterBuilderState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  const border = borderForRole(display, "overlay");
  const t = resolveTheme(display);
  const modalWidth = Math.max(58, Math.min(92, Math.floor(termWidth * 0.72)));
  const leftOffset = Math.max(0, Math.floor((termWidth - modalWidth - 2) / 2));
  const topOffset = Math.max(1, Math.floor(termHeight * 0.1));
  const modalHeight = Math.max(16, termHeight - topOffset * 2 - 2);
  const options = activeOptions(state);

  return Box(
    {
      flexDirection: "column",
      borderStyle: border,
      padding: 1,
      position: "absolute",
      top: topOffset,
      left: leftOffset,
      width: modalWidth,
      height: modalHeight,
      zIndex: 100,
      shouldFill: true,
      overflow: "hidden",
      backgroundColor: t.bg.overlay !== "transparent" ? t.bg.overlay : undefined,
    },
    ModalHeader({ display, title: "Visual where filter", innerWidth: modalWidth - 4 }),
    Text({ content: previewLine(state), attributes: TextAttributes.DIM }),
    Text({ content: "" }),
    Box(
      { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
      ...state.rows.flatMap((_row, idx) => {
        const rows = [filterRowLine(state, idx, display)];
        if (idx < state.rows.length - 1) {
          rows.push(
            Text({
              content: `     ${state.rows[idx + 1]!.join.toUpperCase()}`,
              attributes: TextAttributes.DIM,
            }),
          );
        }
        return rows;
      }),
      Text({ content: "" }),
      Text({ content: ` ${options.title}`, attributes: TextAttributes.DIM }),
      ...visibleOptions(options).map((v) =>
        Text({
          content: optionLine(v, options),
          attributes: v === options.highlighted ? TextAttributes.BOLD : TextAttributes.DIM,
        }),
      ),
    ),
    Text({
      content: " ←/→ chip · ↑/↓ option · ctrl+j/k row · + row · a/o join · enter apply · esc close",
      attributes: TextAttributes.DIM,
    }),
  );
}

function activeOptions(state: FilterBuilderState): {
  title: string;
  entries: string[];
  highlighted: string;
  selected: Set<string>;
  multiselect: boolean;
  highlightedIndex: number;
} {
  const active = state.rows[state.activeRow]!;
  switch (state.activeCell) {
    case "column":
      return {
        title: "Available columns",
        entries: BUILDER_COLUMNS.slice(),
        highlighted: active.column,
        selected: new Set([active.column]),
        multiselect: false,
        highlightedIndex: BUILDER_COLUMNS.indexOf(active.column),
      };
    case "operator": {
      const entries = operatorsForColumn(active.column);
      return {
        title: `Available operators for ${active.column}`,
        entries,
        highlighted: active.operator,
        selected: new Set([active.operator]),
        multiselect: false,
        highlightedIndex: entries.indexOf(active.operator),
      };
    }
    case "value": {
      const entries = state.valueOptions[active.column];
      const highlighted = entries[active.valueCursor] ?? active.value;
      return {
        title: `Available values for ${active.column}`,
        entries,
        highlighted,
        selected: new Set(active.operator === "in" ? selectedValues(active) : [active.value]),
        multiselect: active.operator === "in",
        highlightedIndex: active.valueCursor,
      };
    }
  }
}

function visibleOptions(options: ReturnType<typeof activeOptions>): string[] {
  const maxVisible = 8;
  if (options.entries.length <= maxVisible) return options.entries;
  const highlighted = Math.max(0, options.highlightedIndex);
  const start = Math.max(0, Math.min(highlighted - 3, options.entries.length - maxVisible));
  const end = Math.min(options.entries.length, start + maxVisible);
  const visible = options.entries.slice(start, end);
  if (start > 0) visible.unshift(`… ${start} more above`);
  if (end < options.entries.length) visible.push(`… ${options.entries.length - end} more below`);
  return visible;
}

function optionLine(
  value: string,
  options: { highlighted: string; selected: Set<string>; multiselect: boolean },
): string {
  if (value.startsWith("… ")) return `   ${value}`;
  const cursor = value === options.highlighted ? ">" : " ";
  const mark = options.multiselect ? (options.selected.has(value) ? "[x]" : "[ ]") : "   ";
  return ` ${cursor} ${mark} ${value}`;
}

function previewLine(state: FilterBuilderState): string {
  switch (state.preview.kind) {
    case "pending":
      return " Results: …";
    case "ready":
      return ` Results: ${state.preview.count} records`;
    case "error":
      return ` Results: ${state.preview.message}`;
  }
}

function filterRowLine(
  state: FilterBuilderState,
  idx: number,
  display: ResolvedDisplay,
): ReturnType<typeof Text> {
  const row = state.rows[idx]!;
  const activeRow = idx === state.activeRow;
  const parts = [
    chip(row.column, activeRow && state.activeCell === "column"),
    chip(row.operator, activeRow && state.activeCell === "operator"),
    chip(displayValue(row), activeRow && state.activeCell === "value"),
  ];
  const line = `${activeRow ? " > " : "   "}${parts.join(" ")}`;
  if (display.color === "mono") {
    return Text({
      content: line,
      attributes: activeRow ? TextAttributes.BOLD : TextAttributes.DIM,
    });
  }

  const t = resolveTheme(display);
  const chunk = activeRow ? boldFn(fgFn(t.fg.accent)(line)) : dimFn(line);
  return Text({ content: new StyledText([chunk]), attributes: TextAttributes.NONE });
}

function displayValue(row: FilterBuilderState["rows"][number]): string {
  if (row.operator === "in") return row.values.length > 0 ? row.values.join(" · ") : "values";
  return row.value || "value";
}

function chip(value: string, active: boolean): string {
  return active ? `┌ ${value} ▸ ┐` : `┌ ${value} ┐`;
}
