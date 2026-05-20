import type { KeyEvent } from "../keymap/engine.ts";
import type { BulkConfirmState, Effect, Overlay, OverlayEvent, ReduceResult } from "./types.ts";

export type OpenBulkConfirmArgs = {
  action: BulkConfirmState["action"];
  eligible: BulkConfirmState["eligible"];
  excluded: BulkConfirmState["excluded"];
  label?: string;
};

export function openBulkConfirm(args: OpenBulkConfirmArgs): BulkConfirmState {
  return {
    action: args.action,
    eligible: args.eligible,
    excluded: args.excluded,
    label: args.label,
  };
}

function packed(state: BulkConfirmState): Overlay {
  return { kind: "bulk-confirm", state };
}

function commitEffect(state: BulkConfirmState): Effect {
  if (state.action === "unmark") {
    return { kind: "commitBulkUnmark", eligible: state.eligible };
  }
  return {
    kind: "commitBatch",
    action: state.action,
    eligible: state.eligible,
    label: state.label,
  };
}

function close(): ReduceResult {
  return { overlay: null, effects: [{ kind: "close" }] };
}

function commit(state: BulkConfirmState): ReduceResult {
  return {
    overlay: null,
    effects: [commitEffect(state), { kind: "close" }],
  };
}

export function reduceBulkConfirm(state: BulkConfirmState, event: OverlayEvent): ReduceResult {
  switch (event.kind) {
    case "cancel":
      return close();
    case "commit":
      return commit(state);
    case "key":
      return reduceKey(state, event.event);
    case "streamToken":
    case "streamEnd":
    case "streamError":
    case "paste":
      return { overlay: packed(state), effects: [] };
  }
}

function reduceKey(state: BulkConfirmState, event: KeyEvent): ReduceResult {
  if (event.name === "escape") return close();
  if (event.name === "return") return commit(state);
  if (event.name === "v") {
    // Escape hatch: jump to the marked queue so the reviewer can eyeball
    // the selection before committing. The `drill` effect closes the
    // overlay AND switches queue in one step. Reviewer can re-issue the
    // bulk command from there.
    return {
      overlay: null,
      effects: [{ kind: "drill", queueId: "marked" }],
    };
  }
  return { overlay: packed(state), effects: [] };
}
