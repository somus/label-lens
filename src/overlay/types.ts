import type { AssistantResponse } from "../assistant/schema.ts";
import type { AssistantConfig } from "../config/config.ts";
import type { KeyEvent } from "../keymap/engine.ts";
import type { Predicate } from "../store/queues/predicate.ts";
import type { QueueId } from "../store/queues/registry.ts";
import type { ReviewStatus, SourceOfTruth } from "../types.ts";
import type { FilterBuilderState } from "./filter-builder.ts";
import type { GuidelinesState } from "./guidelines.ts";
import type { HelpState } from "./help.ts";
import type { PaletteState } from "./palette.ts";
import type { QueueState } from "./queue.ts";
import type { StatsOverlayState } from "./stats-overlay.ts";

/** Per-Overlay state types. */

export type PickerCandidate = {
  label: string;
  predicted: boolean;
  /** Confidence rendered inline next to the predicted row. Non-predicted
   *  rows ignore it (only the model's primary prediction carries it). */
  confidence: number | null;
  /** Configured single-char accelerator from `config.labels[].key`. When set,
   * pressing this key in the picker commits the candidate. Rendered in the
   * chip slot in place of the positional digit. */
  key?: string;
};

export type PickerLabel = {
  name: string;
  key?: string;
};

export type PickerState = {
  recordId: string;
  allLabels: PickerLabel[];
  predicted: string | null;
  /** Confidence of the predicted label — surfaced in the picker so the
   *  reviewer sees signal strength while choosing a relabel. */
  predictedConfidence: number | null;
  filter: string;
  candidates: PickerCandidate[];
  highlight: number;
};

export type NoteState = {
  recordId: string;
  value: string;
  /**
   * Quick-attach phrases from `config.notes.presets`. Digit keys 1..9 append the
   * corresponding preset (plus a separator) into `value`. Empty array disables
   * the affordance entirely.
   */
  presets: string[];
};

/** Fields every assistant overlay variant carries, regardless of status. */
export type AssistantBase = {
  recordId: string;
  /** Predicted label at the time the overlay was opened. Used as `prev_label`
   * on the audit row when the reviewer commits a relabel or reject (mirrors
   * the picker / decision-command pattern). Null when no prediction exists. */
  predictedLabel: string | null;
  /** True after `Tab` press — render reasoning markdown above the footer.
   * Tracked on the base so the reviewer can pre-toggle before `done`. */
  reasoningExpanded: boolean;
};

/** Discriminated by `status` — each variant carries only the fields that are
 * valid at that point in the stream lifecycle. Keeps `commit()` and the
 * render layer narrow without nullable bag-of-fields gymnastics. */
export type AssistantState =
  | (AssistantBase & { status: "loading" })
  | (AssistantBase & {
      status: "streaming";
      /** Reasoning text accumulated from streamToken events (PRD §14.4 footer). */
      buffer: string;
    })
  | (AssistantBase & {
      status: "done";
      /** Final suggested label after `streamEnd`. */
      suggestion: string;
      /** Final reasoning markdown after `streamEnd`. */
      reason: string;
      /** Final confidence after `streamEnd`. */
      confidence: AssistantResponse["confidence"];
      /** Final recommendedAction after `streamEnd`. Controls what Enter commits. */
      recommendedAction: AssistantResponse["recommendedAction"];
    })
  | (AssistantBase & { status: "error"; errorMessage: string });

/** Steps of the first-press configure flow (PRD §10.5). */
export type ConfigureAssistantStep = "provider" | "auth" | "privacy" | "commit";

export type ConfigureAssistantState = {
  step: ConfigureAssistantStep;
  /** Provider slug picked in the `provider` step (e.g. "anthropic", "ollama"). */
  selectedProvider?: string;
  /** API key typed in the `auth` step for remote providers. */
  apiKey?: string;
  /** Ollama URL typed in the `auth` step for local providers. */
  ollamaUrl?: string;
  /** `y` press in the `privacy` step flips this true and advances to `commit`. */
  privacyConfirmed?: boolean;
  /** Optional error from a prior step (e.g. empty auth field). */
  error?: string;
};

export type Overlay =
  | { kind: "picker"; state: PickerState }
  | { kind: "note"; state: NoteState }
  | { kind: "configure-assistant"; state: ConfigureAssistantState }
  | { kind: "assistant"; state: AssistantState }
  | { kind: "palette"; state: PaletteState }
  | { kind: "filter-builder"; state: FilterBuilderState }
  | { kind: "help"; state: HelpState }
  | { kind: "guidelines"; state: GuidelinesState }
  | { kind: "stats"; state: StatsOverlayState }
  | { kind: "queue"; state: QueueState };

export type OverlayKind = Overlay["kind"];

/** Uniform event union — keystrokes, async stream tokens, lifecycle. */
export type OverlayEvent =
  | { kind: "key"; event: KeyEvent }
  | { kind: "paste"; text: string }
  | { kind: "streamToken"; token: string }
  | { kind: "streamEnd"; response?: AssistantResponse }
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
  | {
      kind: "updateAssistantConfig";
      assistant: AssistantConfig;
      /**
       * API key typed during the configure flow. Set into `process.env` for
       * the active session via `assistant.apiKeyEnvVar` and never persisted
       * to disk. Reviewer is told to export the var in their shell for the
       * next launch (PRD §10.5 privacy notice).
       */
      sessionApiKey?: string;
    }
  | { kind: "runCommand"; commandName: string; argument?: string }
  | { kind: "drill"; queueId: QueueId }
  | { kind: "pushPaletteHistory"; entry: string }
  | { kind: "scheduleFilterPreview"; predicate: Predicate; revision: number };

export type ReduceResult = {
  overlay: Overlay | null;
  effects: Effect[];
  propagated?: boolean;
};
