import { bg as bgFn, bold as boldFn, dim as dimFn, fg as fgFn, StyledText } from "@opentui/core";
import type { Command } from "../actions/command.ts";
import type { PaletteState } from "../overlay/palette.ts";
import type { CategoryGroup } from "../overlay/palette-categories.ts";
import type { PickerField } from "../overlay/palette-picker.ts";
import { lerpHex } from "./anim.ts";
import { Box } from "./box.ts";
import type { ResolvedDisplay } from "./capability.ts";
import { type Segment, segmentsToStyledText } from "./chrome/status-bar.ts";
import { ModalHeader, modalWidth } from "./modal-frame.ts";
import { progressSegments } from "./progress-segments.ts";
import { Text, TextAttributes } from "./text.ts";
import { borderForRole, resolveTheme } from "./theme.ts";

const PICKER_PROGRESS_WIDTH = 8;

function modalChrome(
  t: ReturnType<typeof resolveTheme>,
  useColor: boolean,
  fading: boolean,
  fadeProgress: number,
): { backgroundColor: string | undefined; borderColor: string | undefined } {
  const hasOverlayBg = t.bg.overlay !== "transparent";
  const hasChromeBg = t.bg.chrome !== "transparent";
  const canLerp = useColor && fading && hasChromeBg;
  const backgroundColor = hasOverlayBg
    ? canLerp
      ? lerpHex(t.bg.chrome, t.bg.overlay, fadeProgress)
      : t.bg.overlay
    : undefined;
  const borderColor = useColor ? t.fg.accent : undefined;
  return { backgroundColor, borderColor };
}

export function renderPalette(
  state: PaletteState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
  fadeProgress = 1,
): ReturnType<typeof Box> {
  const border = borderForRole(display, "overlay");
  const t = resolveTheme(display);
  const isPicker = state.mode === "pick" && state.picker;
  const width = modalWidth(isPicker ? "picker" : "palette", termWidth);
  const leftOffset = Math.max(0, Math.floor((termWidth - width - 2) / 2));
  const topOffset = Math.max(1, Math.floor(termHeight * 0.12));
  const modalHeight = Math.max(12, termHeight - topOffset * 2 - 2);

  if (isPicker && state.picker) {
    return renderPickerModal(
      state.picker,
      display,
      t,
      width,
      modalHeight,
      leftOffset,
      topOffset,
      border,
      fadeProgress,
    );
  }
  return renderBrowseModal(
    state,
    display,
    t,
    width,
    modalHeight,
    leftOffset,
    topOffset,
    border,
    fadeProgress,
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
  fadeProgress: number,
): ReturnType<typeof Box> {
  const innerWidth = modalWidth - 4;
  const entryChildren: ReturnType<typeof Text>[] = [];

  const useColor = display.color === "truecolor" || display.color === "256";
  const fading = display.motion && fadeProgress < 0.99;
  let flatIdx = 0;

  if (state.categories.length > 0) {
    for (const cat of state.categories) {
      entryChildren.push(renderCategoryHeader(cat, useColor, t, fading));
      for (const entry of cat.entries) {
        const isHighlighted = flatIdx === state.highlight;
        entryChildren.push(
          renderEntry(
            entry.palette,
            state.counts.get(entry.palette),
            entryDescription(entry.commandName, state.commands),
            isHighlighted,
            innerWidth,
            useColor,
            t,
            fading,
          ),
        );
        flatIdx++;
      }
      entryChildren.push(Text({ content: "" }));
    }
  } else {
    for (let i = 0; i < state.entries.length && i < 16; i++) {
      const entry = state.entries[i]!;
      const isHighlighted = i === state.highlight;
      entryChildren.push(
        renderEntry(
          entry.palette,
          state.counts.get(entry.palette),
          entryDescription(entry.commandName, state.commands),
          isHighlighted,
          innerWidth,
          useColor,
          t,
          fading,
        ),
      );
    }
    entryChildren.push(Text({ content: "" }));
  }

  const hintLine = Text({
    content: " [enter] run · [↑↓] navigate · [^p/^n] history · [esc] close",
    attributes: TextAttributes.DIM,
  });

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
      ...modalChrome(t, useColor, fading, fadeProgress),
    },
    ModalHeader({ display, title: "Commands", innerWidth: modalWidth - 4 }),
    Text({
      content: ` :${state.filter}_`,
      attributes: fading ? TextAttributes.DIM : TextAttributes.BOLD,
    }),
    Box({ flexDirection: "column", flexGrow: 1, overflow: "hidden" }, ...entryChildren),
    hintLine,
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
  _fadeProgress = 1,
): ReturnType<typeof Box> {
  const innerWidth = modalWidth - 4;
  const useColor = display.color === "truecolor" || display.color === "256";
  const entryChildren: ReturnType<typeof Text>[] = [];

  const maxItems = 16;
  const visible = picker.candidates.slice(0, maxItems);
  const isQueuePicker = picker.pickerKind === "queue" && picker.totalForProgress !== undefined;
  for (let i = 0; i < visible.length; i++) {
    const candidate = visible[i]!;
    const isHighlighted = i === picker.highlight;
    const count = picker.candidateCounts?.get(candidate);
    if (isQueuePicker && count !== undefined) {
      entryChildren.push(
        renderQueueEntry(
          candidate,
          count,
          picker.totalForProgress as number,
          isHighlighted,
          innerWidth,
          display,
        ),
      );
    } else {
      entryChildren.push(
        renderEntry(candidate, count, undefined, isHighlighted, innerWidth, useColor, t),
      );
    }
  }

  if (visible.length === 0 && picker.pickerKind !== "text") {
    entryChildren.push(Text({ content: "  no matches", attributes: TextAttributes.DIM }));
  }
  if (picker.pickerKind === "text" && picker.candidates.length === 0) {
    entryChildren.push(
      Text({ content: "  type a value and press enter", attributes: TextAttributes.DIM }),
    );
    if (picker.commandName === "palette.where") {
      entryChildren.push(Text({ content: "", attributes: TextAttributes.DIM }));
      entryChildren.push(
        Text({
          content: "  columns: status, final_label, prev_label,",
          attributes: TextAttributes.DIM,
        }),
      );
      entryChildren.push(
        Text({
          content: "  source, confidence, reason, issue_type",
          attributes: TextAttributes.DIM,
        }),
      );
      entryChildren.push(
        Text({
          content: "  example: source = 'llm' and confidence < 0.5",
          attributes: TextAttributes.DIM,
        }),
      );
    }
  }

  const titleText =
    picker.filter.length > 0 ? ` ${picker.title} ${picker.filter}_` : ` ${picker.title} _`;
  const hint =
    picker.step === "from"
      ? " [enter/tab] select from · [↑↓] navigate · [esc] back"
      : " [enter] select · [↑↓] navigate · [esc] back";

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
      borderColor: useColor ? t.fg.accent : undefined,
    },
    ModalHeader({ display, title: picker.title, innerWidth: modalWidth - 4 }),
    Text({ content: titleText, attributes: TextAttributes.BOLD }),
    Text({ content: "" }),
    Box({ flexDirection: "column", flexGrow: 1, overflow: "hidden" }, ...entryChildren),
    Text({ content: hint, attributes: TextAttributes.DIM }),
  );
}

function renderCategoryHeader(
  cat: CategoryGroup,
  useColor: boolean,
  t: ReturnType<typeof resolveTheme>,
  fading = false,
): ReturnType<typeof Text> {
  // Icons land in truecolor/256 only — 16/mono drop them (see ADR/issue #46).
  const header = useColor ? ` ${cat.icon} ${cat.label}` : ` ${cat.label}`;
  if (useColor) {
    return Text({
      content: new StyledText([dimFn(fgFn(fading ? t.fg.dim : t.fg.muted)(header))]),
      attributes: TextAttributes.NONE,
    });
  }
  return Text({ content: header, attributes: TextAttributes.DIM });
}

function renderEntry(
  name: string,
  count: number | undefined,
  description: string | undefined,
  highlighted: boolean,
  innerWidth: number,
  useColor: boolean,
  t: ReturnType<typeof resolveTheme>,
  fading = false,
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

  if (useColor && highlighted && !fading) {
    // Solid-cyan bg + inverse fg matches the modal highlight bar locked
    // in plan C2. Bold attribute on top so mono-fallback still reads.
    return Text({
      content: new StyledText([boldFn(bgFn(t.fg.accent)(fgFn(t.bg.overlay)(line)))]),
      attributes: TextAttributes.NONE,
    });
  }
  if (highlighted && !fading) {
    return Text({
      content: line,
      attributes: TextAttributes.BOLD | TextAttributes.INVERSE,
    });
  }
  if (useColor) {
    return Text({
      content: new StyledText([fgFn(fading ? t.fg.dim : t.fg.default)(line)]),
      attributes: TextAttributes.NONE,
    });
  }
  return Text({ content: line, attributes: TextAttributes.DIM });
}

function renderQueueEntry(
  name: string,
  count: number,
  total: number,
  highlighted: boolean,
  innerWidth: number,
  display: ResolvedDisplay,
): ReturnType<typeof Text> {
  const useColor = display.color === "truecolor" || display.color === "256";
  const prefix = highlighted ? " > " : "   ";
  const label = name.startsWith(":") ? name.slice(1) : name;
  const countText = String(count);
  const countTone: Segment["tone"] = count > 0 ? "accent" : "dim";
  const labelTone: Segment["tone"] = highlighted ? "accent" : count > 0 ? "default" : "dim";
  const progress = progressSegments(count, total, PICKER_PROGRESS_WIDTH, display);
  const fixedRight = `${countText.padStart(4, " ")} `;
  const progressLength = progress.reduce((n, s) => n + s.text.length, 0);
  const gap = Math.max(
    1,
    innerWidth - prefix.length - label.length - fixedRight.length - progressLength,
  );
  const segs: Segment[] = [
    { text: prefix, tone: highlighted ? "accent" : "default" },
    { text: label, tone: labelTone },
    { text: " ".repeat(gap), tone: "dim" },
    { text: fixedRight.slice(0, -1), tone: countTone },
    { text: " ", tone: "dim" },
    ...progress,
  ];
  return Text({
    content: useColor ? segmentsToStyledText(segs, display) : segs.map((s) => s.text).join(""),
    attributes: highlighted ? TextAttributes.BOLD : TextAttributes.NONE,
    wrapMode: "char",
  });
}

function entryDescription(commandName: string, commands: Command[]): string | undefined {
  const cmd = commands.find((c) => c.name === commandName);
  return cmd?.paletteMetadata?.description;
}
