import type { AssistantState, Effect, Overlay, OverlayEvent, ReduceResult } from "./types.ts";

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
    status: "loading",
    buffer: "",
    suggestion: null,
    reason: null,
    confidence: null,
    recommendedAction: null,
    reasoningExpanded: false,
    errorMessage: null,
  };
}

function packed(state: AssistantState): Overlay {
  return { kind: "assistant", state };
}

function actionToStatus(action: AssistantState["recommendedAction"]) {
  switch (action) {
    case "accept":
      return "accepted" as const;
    case "relabel":
      return "relabeled" as const;
    case "reject":
      return "rejected" as const;
    case "skip":
      return "skipped" as const;
    default:
      return null;
  }
}

function commit(state: AssistantState): ReduceResult {
  // Only commit once the model has settled. Pre-`done` Enter is a no-op so
  // the reviewer doesn't fire a half-formed decision.
  if (state.status !== "done") {
    return { overlay: packed(state), effects: [] };
  }
  const status = actionToStatus(state.recommendedAction);
  if (!status || !state.suggestion) {
    // recommendedAction outside the known set is theoretical (StringEnum
    // constrains it) but the reviewer is otherwise stuck on a "done" overlay
    // where Enter is a silent no-op. Flash + dismiss so they get feedback and
    // can retry.
    return {
      overlay: null,
      effects: [
        { kind: "markAssistantViewed", recordId: state.recordId },
        {
          kind: "assistantInvalidAction",
          recordId: state.recordId,
          action: state.recommendedAction ?? "(none)",
        },
        { kind: "close" },
      ],
    };
  }
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
    case "streamToken":
      return {
        overlay: packed({
          ...state,
          status: "streaming",
          buffer: state.buffer + event.token,
        }),
        effects: [],
      };
    case "streamEnd": {
      const r = event.response;
      if (!r) {
        return {
          overlay: packed({
            ...state,
            status: "error",
            errorMessage: "Assistant stream ended without a structured response.",
          }),
          effects: [],
        };
      }
      return {
        overlay: packed({
          ...state,
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
          ...state,
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
    return {
      overlay: packed({ ...state, reasoningExpanded: !state.reasoningExpanded }),
      effects: [],
    };
  }
  if (name === "return") return commit(state);
  return { overlay: packed(state), effects: [] };
}
