import type {
  AssistantBase,
  AssistantState,
  Effect,
  Overlay,
  OverlayEvent,
  ReduceResult,
} from "./types.ts";

/**
 * Build an assistant overlay state for `record.openAssistant`. Stays in
 * `loading` until the first streamToken flips it to `streaming`, then to
 * `done` on streamEnd (PRD §14.4 inline footer).
 */
export function openAssistant(
  recordId: string,
  predictedLabel: string | null = null,
): AssistantState {
  return {
    recordId,
    predictedLabel,
    reasoningExpanded: false,
    status: "loading",
  };
}

function packed(state: AssistantState): Overlay {
  return { kind: "assistant", state };
}

function baseOf(state: AssistantState): AssistantBase {
  return {
    recordId: state.recordId,
    predictedLabel: state.predictedLabel,
    reasoningExpanded: state.reasoningExpanded,
  };
}

type DoneAction = Extract<AssistantState, { status: "done" }>["recommendedAction"];

function actionToStatus(action: DoneAction): "accepted" | "relabeled" | "rejected" | "skipped" {
  switch (action) {
    case "accept":
      return "accepted";
    case "relabel":
      return "relabeled";
    case "reject":
      return "rejected";
    case "skip":
      return "skipped";
  }
}

function commit(state: AssistantState): ReduceResult {
  // Only commit once the model has settled. Pre-`done` Enter is a no-op so
  // the reviewer doesn't fire a half-formed decision.
  if (state.status !== "done") {
    return { overlay: packed(state), effects: [] };
  }
  const status = actionToStatus(state.recommendedAction);
  // prev_label follows the same convention as picker / decision commands:
  // record the predicted label on relabel + reject, null on accept + skip.
  const prevLabel = status === "relabeled" || status === "rejected" ? state.predictedLabel : null;
  const effects: Effect[] = [
    { kind: "markAssistantViewed", recordId: state.recordId },
    {
      kind: "commitDecision",
      recordId: state.recordId,
      status,
      finalLabel: status === "rejected" || status === "skipped" ? null : state.suggestion,
      prevLabel,
      sourceOfTruth: "human+assistant",
    },
    { kind: "close" },
  ];
  return { overlay: null, effects };
}

function dismiss(state: AssistantState): ReduceResult {
  // ADR 0004: opening the panel counts as exposure even on dismiss.
  return {
    overlay: null,
    effects: [{ kind: "markAssistantViewed", recordId: state.recordId }, { kind: "close" }],
  };
}

export function reduceAssistant(state: AssistantState, event: OverlayEvent): ReduceResult {
  switch (event.kind) {
    case "cancel":
      return dismiss(state);
    case "commit":
      return commit(state);
    case "streamToken": {
      const prior = state.status === "streaming" ? state.buffer : "";
      return {
        overlay: packed({
          ...baseOf(state),
          status: "streaming",
          buffer: prior + event.token,
        }),
        effects: [],
      };
    }
    case "streamEnd": {
      const r = event.response;
      if (!r) {
        return {
          overlay: packed({
            ...baseOf(state),
            status: "error",
            errorMessage: "Assistant stream ended without a structured response.",
          }),
          effects: [],
        };
      }
      return {
        overlay: packed({
          ...baseOf(state),
          status: "done",
          suggestion: r.suggestedLabel,
          confidence: r.confidence,
          recommendedAction: r.recommendedAction,
          reason: r.reasoning,
        }),
        effects: [],
      };
    }
    case "streamError":
      return {
        overlay: packed({
          ...baseOf(state),
          status: "error",
          errorMessage: event.error instanceof Error ? event.error.message : String(event.error),
        }),
        effects: [],
      };
    case "key":
      return reduceKey(state, event.event.name);
    case "paste":
      // Assistant overlay doesn't accept user text — ignore paste.
      return { overlay: packed(state), effects: [] };
  }
}

function reduceKey(state: AssistantState, name: string): ReduceResult {
  if (name === "escape") return dismiss(state);
  if (name === "tab") {
    const toggled: AssistantState = { ...state, reasoningExpanded: !state.reasoningExpanded };
    return { overlay: packed(toggled), effects: [] };
  }
  if (name === "return") return commit(state);
  return { overlay: packed(state), effects: [] };
}
