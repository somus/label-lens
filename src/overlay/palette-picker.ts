import type { OverlayEvent } from "./types.ts";

export type PickerField = {
  commandName: string;
  pickerKind: string;
  title: string;
  candidates: string[];
  allCandidates: string[];
  candidateCounts?: Map<string, number>;
  filter: string;
  highlight: number;
  step?: "from" | "to";
  selectedFrom?: string;
};

function filteredCandidates(all: string[], filter: string): string[] {
  if (filter.length === 0) return all.slice();
  const needle = filter.toLowerCase();
  return all.filter((c) => c.toLowerCase().includes(needle));
}

export function openPicker(
  commandName: string,
  pickerKind: string,
  candidates: string[],
  candidateCounts?: Map<string, number>,
): PickerField {
  const isCorrection = pickerKind === "correction";
  return {
    commandName,
    pickerKind,
    title: isCorrection ? "by-correction > from?" : `${commandName.replace("palette.", "")} >`,
    candidates: candidates.slice(),
    allCandidates: candidates.slice(),
    candidateCounts,
    filter: "",
    highlight: 0,
    step: isCorrection ? "from" : undefined,
  };
}

export type PickerResult =
  | { kind: "updated"; picker: PickerField }
  | { kind: "selected"; commandName: string; argument: string }
  | { kind: "back" }
  | { kind: "noop" };

export function reducePicker(picker: PickerField, event: OverlayEvent): PickerResult {
  if (event.kind === "cancel") return { kind: "back" };
  if (event.kind !== "key") return { kind: "noop" };

  const name = event.event.name;

  if (name === "escape") return { kind: "back" };

  if (name === "return") {
    const entry = picker.candidates[picker.highlight];
    if (!entry) {
      if (picker.pickerKind === "text" && picker.filter.trim().length > 0) {
        return {
          kind: "selected",
          commandName: picker.commandName,
          argument: picker.filter.trim(),
        };
      }
      return { kind: "noop" };
    }

    if (picker.step === "from") {
      return {
        kind: "updated",
        picker: advanceCorrectionStep(picker, entry),
      };
    }

    if (picker.step === "to" && picker.selectedFrom) {
      return {
        kind: "selected",
        commandName: picker.commandName,
        argument: `${picker.selectedFrom}:${entry}`,
      };
    }

    return {
      kind: "selected",
      commandName: picker.commandName,
      argument: entry,
    };
  }

  if (name === "tab" && picker.step === "from") {
    const entry = picker.candidates[picker.highlight];
    if (!entry) return { kind: "noop" };
    return {
      kind: "updated",
      picker: advanceCorrectionStep(picker, entry),
    };
  }

  if (name === "down") {
    if (picker.candidates.length === 0) return { kind: "noop" };
    return {
      kind: "updated",
      picker: {
        ...picker,
        highlight: Math.min(picker.highlight + 1, picker.candidates.length - 1),
      },
    };
  }

  if (name === "up") {
    if (picker.candidates.length === 0) return { kind: "noop" };
    return {
      kind: "updated",
      picker: { ...picker, highlight: Math.max(picker.highlight - 1, 0) },
    };
  }

  if (name === "backspace") {
    const newFilter = picker.filter.slice(0, -1);
    const newCandidates = filteredCandidates(picker.allCandidates, newFilter);
    return {
      kind: "updated",
      picker: { ...picker, filter: newFilter, candidates: newCandidates, highlight: 0 },
    };
  }

  const ch = name === "space" ? " " : name;
  if (ch.length === 1 && ch >= " " && ch < "\x7f" && !event.event.ctrl) {
    const newFilter = picker.filter + ch;
    const newCandidates = filteredCandidates(picker.allCandidates, newFilter);
    return {
      kind: "updated",
      picker: { ...picker, filter: newFilter, candidates: newCandidates, highlight: 0 },
    };
  }

  return { kind: "noop" };
}

function advanceCorrectionStep(picker: PickerField, fromLabel: string): PickerField {
  return {
    ...picker,
    step: "to",
    selectedFrom: fromLabel,
    title: `by-correction > ${fromLabel} → ?`,
    filter: "",
    highlight: 0,
    allCandidates: [],
    candidates: [],
  };
}
