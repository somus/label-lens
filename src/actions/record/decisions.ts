import type { AppContext } from "../../app/context.ts";
import { type LabelConfigEntry, labelKey, labelName } from "../../config/config.ts";
import { decodeLabelSet, encodeLabelSet, labelSetsEqual } from "../../labels/label-set.ts";
import { applyEffects } from "../../overlay/effects.ts";
import type { Effect } from "../../overlay/types.ts";
import type { RecordWithPrimaryPrediction } from "../../types.ts";
import type { Command, CommandBindings } from "../command.ts";

/**
 * Multi-label draft semantics: `1`–`9` and per-label-key shortcuts toggle
 * labels in/out of an in-progress set. The first toggle on a fresh record
 * seeds the draft from the primary Prediction set so the reviewer's first
 * keystroke removes/adds against the predicted set, not against `{}`.
 * `Enter` commits the draft; `record.next` / `record.prev` clears it.
 */
function toggleMultiLabelDraft(
  ctx: AppContext,
  record: RecordWithPrimaryPrediction,
  label: string,
): void {
  let draft = ctx.multiLabelDraft;
  if (!draft || draft.recordId !== record.id) {
    // Filter the seeded set against the live config so a stale Prediction
    // (e.g. a label removed from config after ingest) cannot ride into a
    // committed Annotation. findUnknownLabels gates this at boot; this is
    // belt-and-braces for mid-session edits.
    const configured = new Set(ctx.config.labels.map((e) => labelName(e)));
    const predicted = record.primaryPrediction
      ? decodeLabelSet(record.primaryPrediction.label).filter((l) => configured.has(l))
      : [];
    draft = { recordId: record.id, selected: new Set(predicted) };
    ctx.multiLabelDraft = draft;
  }
  if (draft.selected.has(label)) draft.selected.delete(label);
  else draft.selected.add(label);
  // Toggle bypasses `applyEffects` (no Review write), so it owns the
  // render trigger itself — otherwise the chip rail diff glyphs only
  // refresh on the next unrelated keystroke.
  ctx.requestRender();
}

/**
 * A Review state transition keyed off the current Record. Same shape across
 * accept / reject / skip / relabel-by-index: pick a status, derive
 * final/prev labels from the Record, emit a `commitDecision` Effect through
 * the same channel the Picker overlay uses.
 *
 * Per ADR 0007 and the Overlay seam, all Review state changes flow through
 * `applyEffects` so the underlying audit log stays consistent.
 */
type DecisionStatus = Extract<Effect, { kind: "commitDecision" }>["status"];

type DecisionSpec = {
  name: string;
  bindings: CommandBindings;
  status: DecisionStatus;
  /** Returns the label to record. `null` for status='rejected'/'skipped'. */
  finalLabel: (record: RecordWithPrimaryPrediction) => string | null;
  /** Returns the prev label (audit). Typically the predicted label, or null. */
  prevLabel: (record: RecordWithPrimaryPrediction) => string | null;
  /** When true, refuse the decision if the record has no primary prediction. */
  requiresPrediction?: boolean;
};

function decisionCommand(spec: DecisionSpec): Command {
  return {
    name: spec.name,
    scope: "review",
    bindings: spec.bindings,
    enabled: (ctx) => ctx.cursor?.current() != null,
    run: (ctx) => {
      const record = ctx.cursor?.current();
      if (!record || !ctx.queueId) return;
      if (spec.requiresPrediction && !record.primaryPrediction) {
        ctx.setFlash("Cannot accept: record has no prediction", "error");
        return;
      }
      const effect: Effect = {
        kind: "commitDecision",
        recordId: record.id,
        status: spec.status,
        finalLabel: spec.finalLabel(record),
        prevLabel: spec.prevLabel(record),
        sourceOfTruth: ctx.viewedAssistant.has(record.id) ? "human+assistant" : "human",
      };
      applyEffects(ctx, ctx.queueId, [effect]);
    },
  };
}

export const accept: Command = {
  ...decisionCommand({
    name: "record.accept",
    bindings: { vim: "a" },
    status: "accepted",
    finalLabel: (r) => r.primaryPrediction?.label ?? null,
    prevLabel: () => null,
    requiresPrediction: true,
  }),
  footer: { label: "accept", order: 10 },
};

export const reject: Command = {
  ...decisionCommand({
    name: "record.reject",
    bindings: { vim: "x" },
    status: "rejected",
    finalLabel: () => null,
    prevLabel: (r) => r.primaryPrediction?.label ?? null,
  }),
  footer: { label: "reject", order: 30 },
};

export const skip: Command = {
  ...decisionCommand({
    name: "record.skip",
    bindings: { vim: "s" },
    status: "skipped",
    finalLabel: () => null,
    prevLabel: () => null,
  }),
  footer: { label: "skip", order: 40 },
};

/**
 * `1`..`9` quick-relabel. Resolves the label by index into `config.labels`;
 * status='accepted' when the chosen label matches the prediction, else
 * 'relabeled'. Out-of-range indexes flash an error and skip the decision.
 */
export function relabelByIndexCommand(n: number): Command {
  return {
    name: `record.relabelByIndex.${n}`,
    scope: "review",
    bindings: { vim: String(n) },
    enabled: (ctx) => ctx.cursor?.current() != null,
    run: (ctx: AppContext) => {
      const record = ctx.cursor?.current();
      if (!record || !ctx.queueId) return;
      const entry = ctx.config.labels[n - 1];
      if (!entry) {
        ctx.setFlash(`No label at position ${n}`, "error");
        return;
      }
      if (ctx.config.task === "multi-label") {
        toggleMultiLabelDraft(ctx, record, labelName(entry));
        return;
      }
      const label = labelName(entry);
      const predicted = record.primaryPrediction?.label ?? null;
      const status = predicted === label ? "accepted" : "relabeled";
      const effect: Effect = {
        kind: "commitDecision",
        recordId: record.id,
        status,
        finalLabel: label,
        prevLabel: status === "relabeled" ? predicted : null,
        sourceOfTruth: ctx.viewedAssistant.has(record.id) ? "human+assistant" : "human",
      };
      applyEffects(ctx, ctx.queueId, [effect]);
    },
  };
}

export const relabelByIndexCommands: Command[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
  relabelByIndexCommand(n),
);

/**
 * `Enter` under `task: "multi-label"` commits the in-progress draft set as
 * the Annotation. Status follows set equality with the primary Prediction
 * set: equal → `accepted`, differs → `relabeled`. Empty selected set is
 * refused (flash an error); reviewer should use `x` (reject) instead.
 * No-op when no draft exists or when the task is not multi-label.
 */
export const commitMultiLabelDraft: Command = {
  name: "record.commitMultiLabelDraft",
  scope: "review",
  bindings: { vim: "return", simple: "return" },
  enabled: (ctx) =>
    ctx.config.task === "multi-label" &&
    ctx.cursor?.current() != null &&
    ctx.multiLabelDraft !== null &&
    ctx.multiLabelDraft.recordId === ctx.cursor?.current()?.id,
  run: (ctx: AppContext) => {
    const record = ctx.cursor?.current();
    if (!record || !ctx.queueId) return;
    const draft = ctx.multiLabelDraft;
    if (!draft || draft.recordId !== record.id) return;
    if (draft.selected.size === 0) {
      ctx.setFlash("Cannot commit empty multi-label set — use x to reject instead", "error");
      return;
    }
    const order = new Map(ctx.config.labels.map((entry, i) => [labelName(entry), i]));
    const selected = [...draft.selected].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const predicted = record.primaryPrediction
      ? decodeLabelSet(record.primaryPrediction.label)
      : [];
    const status = labelSetsEqual(selected, predicted) ? "accepted" : "relabeled";
    const effect: Effect = {
      kind: "commitDecision",
      recordId: record.id,
      status,
      finalLabel: encodeLabelSet(selected),
      prevLabel: status === "relabeled" ? encodeLabelSet(predicted) : null,
      sourceOfTruth: ctx.viewedAssistant.has(record.id) ? "human+assistant" : "human",
    };
    ctx.clearMultiLabelDraft();
    applyEffects(ctx, ctx.queueId, [effect]);
  },
};

/**
 * Per-label key accelerator: `config.labels[].key` binds a single char to the
 * relabel decision for that label. Returns `null` for string-form labels or
 * object entries without a `key` — the caller filters those out before
 * registering. Command name is keyed by the label name (stable identity);
 * the binding is the configured key.
 */
export function relabelByKeyCommand(entry: LabelConfigEntry): Command | null {
  const key = labelKey(entry);
  if (key === null) return null;
  const label = labelName(entry);
  return {
    name: `record.relabelByKey.${label}`,
    scope: "review",
    binding: key,
    enabled: (ctx) => ctx.cursor?.current() != null,
    run: (ctx: AppContext) => {
      const record = ctx.cursor?.current();
      if (!record || !ctx.queueId) return;
      if (ctx.config.task === "multi-label") {
        toggleMultiLabelDraft(ctx, record, label);
        return;
      }
      const predicted = record.primaryPrediction?.label ?? null;
      const status = predicted === label ? "accepted" : "relabeled";
      const effect: Effect = {
        kind: "commitDecision",
        recordId: record.id,
        status,
        finalLabel: label,
        prevLabel: status === "relabeled" ? predicted : null,
        sourceOfTruth: ctx.viewedAssistant.has(record.id) ? "human+assistant" : "human",
      };
      applyEffects(ctx, ctx.queueId, [effect]);
    },
  };
}
