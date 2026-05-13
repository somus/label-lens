import { bold as boldFn, dim as dimFn, fg as fgFn, StyledText } from "@opentui/core";
import type { Command } from "../actions/command.ts";
import type { PaletteState } from "../overlay/palette.ts";
import type { CategoryGroup } from "../overlay/palette-categories.ts";
import type { PickerField } from "../overlay/palette-picker.ts";
import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import { Text, TextAttributes } from "./text.ts";
import { borderForRole, resolveTheme } from "./theme.ts";

export function renderPalette(
  state: PaletteState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  const border = borderForRole(display, "overlay");
  const t = resolveTheme(display);
  const modalWidth = Math.max(50, Math.min(80, Math.floor(termWidth * 0.6)));
  const leftOffset = Math.max(0, Math.floor((termWidth - modalWidth - 2) / 2));
  const topOffset = Math.max(1, Math.floor(termHeight * 0.12));
  const modalHeight = Math.max(12, termHeight - topOffset * 2 - 2);

  if (state.mode === "pick" && state.picker) {
    return renderPickerModal(
      state.picker,
      display,
      t,
      modalWidth,
      modalHeight,
      leftOffset,
      topOffset,
      border,
    );
  }
  return renderBrowseModal(
    state,
    display,
    t,
    modalWidth,
    modalHeight,
    leftOffset,
    topOffset,
    border,
  );
}

function renderBrowseModal(
  state: PaletteState,
  display: ResolvedDisplay,
  t: ReturnType<typeof resolveTheme>,
  modalWidth: number,
  modalHeight: number,
  leftOffset: number,
  topOffset: number,
  border: "rounded" | "single",
): ReturnType<typeof Box> {
  const innerWidth = modalWidth - 4;
  const children: ReturnType<typeof Text>[] = [];

  children.push(Text({ content: ` :${state.filter}_`, attributes: TextAttributes.BOLD }));
  children.push(Text({ content: "" }));

  const useColor = display.color === "truecolor" || display.color === "256";
  let flatIdx = 0;

  if (state.categories.length > 0) {
    for (const cat of state.categories) {
      children.push(renderCategoryHeader(cat, useColor, t));
      for (const entry of cat.entries) {
        const isHighlighted = flatIdx === state.highlight;
        children.push(
          renderEntry(
            entry.palette,
            state.counts.get(entry.palette),
            entryDescription(entry.commandName, state.commands),
            isHighlighted,
            innerWidth,
            useColor,
            t,
          ),
        );
        flatIdx++;
      }
      children.push(Text({ content: "" }));
    }
  } else {
    for (let i = 0; i < state.entries.length && i < 16; i++) {
      const entry = state.entries[i]!;
      const isHighlighted = i === state.highlight;
      children.push(
        renderEntry(
          entry.palette,
          state.counts.get(entry.palette),
          entryDescription(entry.commandName, state.commands),
          isHighlighted,
          innerWidth,
          useColor,
          t,
        ),
      );
    }
    children.push(Text({ content: "" }));
  }

  children.push(
    Text({
      content: " [enter] run · [↑↓] navigate · [^p/^n] history · [esc] close",
      attributes: TextAttributes.DIM,
    }),
  );

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
    ...children,
  );
}

function renderPickerModal(
  picker: PickerField,
  display: ResolvedDisplay,
  t: ReturnType<typeof resolveTheme>,
  modalWidth: number,
  modalHeight: number,
  leftOffset: number,
  topOffset: number,
  border: "rounded" | "single",
): ReturnType<typeof Box> {
  const innerWidth = modalWidth - 4;
  const useColor = display.color === "truecolor" || display.color === "256";
  const children: ReturnType<typeof Text>[] = [];

  const titleText =
    picker.filter.length > 0 ? ` ${picker.title} ${picker.filter}_` : ` ${picker.title} _`;
  children.push(Text({ content: titleText, attributes: TextAttributes.BOLD }));
  children.push(Text({ content: "" }));

  const maxItems = 16;
  const visible = picker.candidates.slice(0, maxItems);
  for (let i = 0; i < visible.length; i++) {
    const candidate = visible[i]!;
    const isHighlighted = i === picker.highlight;
    const count = picker.candidateCounts?.get(candidate);
    children.push(renderEntry(candidate, count, undefined, isHighlighted, innerWidth, useColor, t));
  }

  if (visible.length === 0) {
    children.push(Text({ content: "  no matches", attributes: TextAttributes.DIM }));
  }

  children.push(Text({ content: "" }));

  const hint =
    picker.step === "from"
      ? " [enter/tab] select from · [↑↓] navigate · [esc] back"
      : " [enter] select · [↑↓] navigate · [esc] back";
  children.push(Text({ content: hint, attributes: TextAttributes.DIM }));

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
    ...children,
  );
}

function renderCategoryHeader(
  cat: CategoryGroup,
  useColor: boolean,
  t: ReturnType<typeof resolveTheme>,
): ReturnType<typeof Text> {
  if (useColor) {
    return Text({
      content: new StyledText([dimFn(fgFn(t.fg.muted)(` ${cat.label}`))]),
      attributes: TextAttributes.NONE,
    });
  }
  return Text({ content: ` ${cat.label}`, attributes: TextAttributes.DIM });
}

function renderEntry(
  name: string,
  count: number | undefined,
  description: string | undefined,
  highlighted: boolean,
  innerWidth: number,
  useColor: boolean,
  t: ReturnType<typeof resolveTheme>,
): ReturnType<typeof Text> {
  const prefix = highlighted ? " > " : "   ";
  const label = name.startsWith(":") ? name.slice(1) : name;

  let right = "";
  if (count !== undefined) {
    right = String(count);
  } else if (description) {
    right = description;
  }

  const leftText = `${prefix}${label}`;
  const gap = Math.max(2, innerWidth - leftText.length - right.length);
  const line = `${leftText}${" ".repeat(gap)}${right}`;

  if (useColor && highlighted) {
    return Text({
      content: new StyledText([boldFn(fgFn(t.fg.accent)(line))]),
      attributes: TextAttributes.NONE,
    });
  }
  if (highlighted) {
    return Text({ content: line, attributes: TextAttributes.BOLD });
  }
  if (useColor) {
    return Text({
      content: new StyledText([fgFn(t.fg.default)(line)]),
      attributes: TextAttributes.NONE,
    });
  }
  return Text({ content: line, attributes: TextAttributes.DIM });
}

function entryDescription(commandName: string, commands: Command[]): string | undefined {
  const cmd = commands.find((c) => c.name === commandName);
  return cmd?.paletteMetadata?.description;
}
