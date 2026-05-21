import type { ExtractionField } from "../config/config.ts";
import {
  type ExtractionObject,
  encodeExtractionObject,
  extractionObjectsEqual,
} from "../labels/extraction-object.ts";
import { keepPrintableInputChars } from "./input-filter.ts";
import { isOverlayNext, isOverlayPrev } from "./key-match.ts";
import type { Effect, Overlay, OverlayEvent, ReduceResult } from "./types.ts";

export type ExtractionFormState = {
  recordId: string;
  fields: ExtractionField[];
  /** Canonical predicted object (config-order). */
  predicted: ExtractionObject;
  /** Current draft (config-order); each value string|null. */
  draft: ExtractionObject;
  /** Index of focused field in `fields`. */
  focus: number;
  /** True while the focused field's value is being edited inline. */
  editing: boolean;
  /** Buffer of in-flight typed value. Committed to `draft` on Enter. */
  editBuffer: string;
  /** Sticky source-of-truth tag — set when the assistant panel was viewed. */
  assistantViewed: boolean;
};

export type OpenExtractionFormArgs = {
  recordId: string;
  fields: ExtractionField[];
  predicted: ExtractionObject;
  /** Prior committed Review object (canonical) to resume from, if any. */
  previousReview: ExtractionObject | null;
  assistantViewed?: boolean;
};

function canonicalCopy(fields: ExtractionField[], source: ExtractionObject): ExtractionObject {
  const out: ExtractionObject = {};
  for (const f of fields) out[f.name] = source[f.name] ?? null;
  return out;
}

export function openExtractionForm(args: OpenExtractionFormArgs): ExtractionFormState {
  const draft = canonicalCopy(args.fields, args.previousReview ?? args.predicted);
  return {
    recordId: args.recordId,
    fields: args.fields,
    predicted: canonicalCopy(args.fields, args.predicted),
    draft,
    focus: 0,
    editing: false,
    editBuffer: "",
    assistantViewed: args.assistantViewed ?? false,
  };
}

function packed(state: ExtractionFormState): Overlay {
  return { kind: "extraction-form", state };
}

function withFocus(state: ExtractionFormState, focus: number): ExtractionFormState {
  if (state.fields.length === 0) return state;
  const next = Math.max(0, Math.min(focus, state.fields.length - 1));
  return { ...state, focus: next };
}

function enterEdit(state: ExtractionFormState): ExtractionFormState {
  const field = state.fields[state.focus];
  if (!field) return state;
  const current = state.draft[field.name] ?? "";
  return { ...state, editing: true, editBuffer: current };
}

function commitEditValue(state: ExtractionFormState): ExtractionFormState {
  const field = state.fields[state.focus];
  if (!field) return state;
  const value = state.editBuffer.length === 0 ? null : state.editBuffer;
  return {
    ...state,
    editing: false,
    editBuffer: "",
    draft: { ...state.draft, [field.name]: value },
  };
}

function cancelEdit(state: ExtractionFormState): ExtractionFormState {
  return { ...state, editing: false, editBuffer: "" };
}

function missingRequired(state: ExtractionFormState): string[] {
  return state.fields
    .filter((f) => f.required && (state.draft[f.name] ?? "") === "")
    .map((f) => f.name);
}

function commitReview(state: ExtractionFormState): ReduceResult {
  if (missingRequired(state).length > 0) {
    return { overlay: packed(state), effects: [] };
  }
  const status: "accepted" | "relabeled" = extractionObjectsEqual(state.draft, state.predicted)
    ? "accepted"
    : "relabeled";
  const finalLabel = encodeExtractionObject(state.draft, state.fields);
  const prevLabel =
    status === "relabeled" ? encodeExtractionObject(state.predicted, state.fields) : null;
  const sourceOfTruth = state.assistantViewed ? "human+assistant" : "human";
  const effects: Effect[] = [
    {
      kind: "commitDecision",
      recordId: state.recordId,
      status,
      finalLabel,
      prevLabel,
      sourceOfTruth,
    },
    { kind: "close" },
  ];
  return { overlay: null, effects };
}

export function reduceExtractionForm(
  state: ExtractionFormState,
  event: OverlayEvent,
): ReduceResult {
  switch (event.kind) {
    case "cancel":
      if (state.editing) return { overlay: packed(cancelEdit(state)), effects: [] };
      return { overlay: null, effects: [{ kind: "close" }] };
    case "commit":
      return commitReview(state);
    case "key":
      return reduceKey(state, event);
    case "paste":
      if (!state.editing) return { overlay: packed(state), effects: [] };
      return {
        overlay: packed({
          ...state,
          editBuffer:
            state.editBuffer + keepPrintableInputChars(event.text.replace(/[\r\n]+/g, " ")),
        }),
        effects: [],
      };
    case "streamToken":
    case "streamEnd":
    case "streamError":
      return { overlay: packed(state), effects: [] };
  }
}

function reduceKey(
  state: ExtractionFormState,
  evt: Extract<OverlayEvent, { kind: "key" }>,
): ReduceResult {
  const name = evt.event.name;
  if (state.editing) {
    if (name === "escape") return { overlay: packed(cancelEdit(state)), effects: [] };
    if (name === "return") return { overlay: packed(commitEditValue(state)), effects: [] };
    if (name === "backspace") {
      return {
        overlay: packed({ ...state, editBuffer: state.editBuffer.slice(0, -1) }),
        effects: [],
      };
    }
    if (typeof name === "string" && name.length === 1) {
      const kept = keepPrintableInputChars(name);
      if (kept.length > 0) {
        return {
          overlay: packed({ ...state, editBuffer: state.editBuffer + kept }),
          effects: [],
        };
      }
    }
    return { overlay: packed(state), effects: [] };
  }
  if (name === "escape") return { overlay: null, effects: [{ kind: "close" }] };
  if (name === "return") return commitReview(state);
  if (name === "e") return { overlay: packed(enterEdit(state)), effects: [] };
  if (isOverlayPrev(evt.event, evt.preset)) {
    return { overlay: packed(withFocus(state, state.focus - 1)), effects: [] };
  }
  if (isOverlayNext(evt.event, evt.preset)) {
    return { overlay: packed(withFocus(state, state.focus + 1)), effects: [] };
  }
  return { overlay: packed(state), effects: [], propagated: true };
}
