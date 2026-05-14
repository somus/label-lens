import type { KeyEvent } from "../keymap/engine.ts";
import type { Predicate } from "../store/queues/predicate.ts";
import type { ReviewStatus, SourceOfTruth } from "../types.ts";
import type { FilterBuilderState } from "./filter-builder.ts";
import type { GuidelinesState } from "./guidelines.ts";
import type { HelpState } from "./help.ts";
import type { PaletteState } from "./palette.ts";
import type { StatsOverlayState } from "./stats-overlay.ts";

/** Per-Overlay state types. */

export type PickerCandidate = { label: string; predicted: boolean };

export type PickerState = {
  recordId: string;
  allLabels: string[];
  predicted: string | null;
  filter: string;
  candidates: PickerCandidate[];
  highlight: number;
};

export type NoteState = {
  recordId: string;
  value: string;
};

export type AssistantState = {
  recordId: string;
  status: "loading" | "streaming" | "done" | "error";
  buffer: string;
  suggestion: string | null;
  reason: string | null;
  errorMessage: string | null;
};

export type Overlay =
  | { kind: "picker"; state: PickerState }
  | { kind: "note"; state: NoteState }
  | { kind: "assistant"; state: AssistantState }
  | { kind: "palette"; state: PaletteState }
  | { kind: "filter-builder"; state: FilterBuilderState }
  | { kind: "help"; state: HelpState }
  | { kind: "guidelines"; state: GuidelinesState }
  | { kind: "stats"; state: StatsOverlayState };

export type OverlayKind = Overlay["kind"];

/** Uniform event union — keystrokes, async stream tokens, lifecycle. */
export type OverlayEvent =
  | { kind: "key"; event: KeyEvent }
  | { kind: "streamToken"; token: string }
  | { kind: "streamEnd" }
  | { kind: "streamError"; error: unknown }
  | { kind: "cancel" }
  | { kind: "commit" };

/** Data effects emitted by the reducer; the screen-side interpreter applies them. */
export type Effect =
  | { kind: "close" }
  | {
      kind: "commitDecision";
      recordId: string;
      status: Exclude<ReviewStatus, "pending" | "undone">;
      finalLabel: string | null;
      prevLabel: string | null;
      sourceOfTruth: SourceOfTruth;
    }
  | { kind: "updateNote"; recordId: string; value: string }
  | { kind: "markAssistantViewed"; recordId: string }
  | { kind: "runCommand"; commandName: string; argument?: string }
  | { kind: "pushPaletteHistory"; entry: string }
  | { kind: "scheduleFilterPreview"; predicate: Predicate; revision: number };

export type ReduceResult = {
  overlay: Overlay | null;
  effects: Effect[];
};
