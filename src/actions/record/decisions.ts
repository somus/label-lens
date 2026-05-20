import type { AppContext } from "../../app/context.ts";
import { type LabelConfigEntry, labelKey, labelName } from "../../config/config.ts";
import { applyEffects } from "../../overlay/effects.ts";
import type { Effect } from "../../overlay/types.ts";
import type { RecordWithPrimaryPrediction } from "../../types.ts";
import type { Command, CommandBindings } from "../command.ts";

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
    enabled: (ctx) => ctx.config.task !== "multi-label" && ctx.cursor?.current() != null,
    run: (ctx: AppContext) => {
      const record = ctx.cursor?.current();
      if (!record || !ctx.queueId) return;
      if (ctx.config.task === "multi-label") {
        ctx.setFlash(
          "Use r to open the multi-label picker; 1-9 shortcuts are single-label only",
          "warning",
        );
        return;
      }
      const entry = ctx.config.labels[n - 1];
      if (!entry) {
        ctx.setFlash(`No label at position ${n}`, "error");
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
    enabled: (ctx) => ctx.config.task !== "multi-label" && ctx.cursor?.current() != null,
    run: (ctx: AppContext) => {
      const record = ctx.cursor?.current();
      if (!record || !ctx.queueId) return;
      if (ctx.config.task === "multi-label") {
        ctx.setFlash("Use r to toggle labels under the multi-label picker", "warning");
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
