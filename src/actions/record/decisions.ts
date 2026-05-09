import type { AppContext } from "../../app/context.ts";
import { labelName } from "../../config/config.ts";
import { applyEffects } from "../../overlay/effects.ts";
import type { Effect } from "../../overlay/types.ts";
import type { RecordWithPrimaryPrediction } from "../../types.ts";
import type { Command } from "../command.ts";

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
  binding: string | string[];
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
    binding: spec.binding,
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
        sourceOfTruth: "human",
      };
      applyEffects(ctx, ctx.queueId, [effect]);
    },
  };
}

export const accept: Command = decisionCommand({
  name: "record.accept",
  binding: "a",
  status: "accepted",
  finalLabel: (r) => r.primaryPrediction?.label ?? null,
  prevLabel: () => null,
  requiresPrediction: true,
});

export const reject: Command = decisionCommand({
  name: "record.reject",
  binding: "x",
  status: "rejected",
  finalLabel: () => null,
  prevLabel: (r) => r.primaryPrediction?.label ?? null,
});

export const skip: Command = decisionCommand({
  name: "record.skip",
  binding: "s",
  status: "skipped",
  finalLabel: () => null,
  prevLabel: () => null,
});

/**
 * `1`..`9` quick-relabel. Resolves the label by index into `config.labels`;
 * status='accepted' when the chosen label matches the prediction, else
 * 'relabeled'. Out-of-range indexes flash an error and skip the decision.
 */
export function relabelByIndexCommand(n: number): Command {
  return {
    name: `record.relabelByIndex.${n}`,
    scope: "review",
    binding: String(n),
    enabled: (ctx) => ctx.cursor?.current() != null,
    run: (ctx: AppContext) => {
      const record = ctx.cursor?.current();
      if (!record || !ctx.queueId) return;
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
        sourceOfTruth: "human",
      };
      applyEffects(ctx, ctx.queueId, [effect]);
    },
  };
}

export const relabelByIndexCommands: Command[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
  relabelByIndexCommand(n),
);
