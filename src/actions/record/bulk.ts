import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../app/context.ts";
import { type LabelConfigEntry, labelName } from "../../config/config.ts";
import {
  type BuiltinIssueType,
  isBuiltinIssueType,
  type LearningDecisionStatus,
} from "../../learning/smart-learning.ts";
import { COMPUTED_SIGNAL_SOURCE, issuesForRecord } from "../../store/issues.ts";
import type { QueueId } from "../../store/queues/registry.ts";
import { insertReview } from "../../store/records.ts";
import { recordTags } from "../../store/schema.ts";
import type { RecordWithPrimaryPrediction } from "../../types.ts";

export type BulkAction = "accept" | "relabel" | "reject" | "skip" | "unmark";
export type BulkReviewAction = Exclude<BulkAction, "unmark">;

export type BulkSelectInput<T extends { id: string }> = {
  action: BulkAction;
  marked: T[];
  reviewed: ReadonlySet<string>;
};

export type BulkSelectResult<T extends { id: string }> = {
  eligible: T[];
  excluded: T[];
};

export function selectBulkTargets<T extends { id: string }>(
  input: BulkSelectInput<T>,
): BulkSelectResult<T> {
  if (input.action === "unmark") {
    return { eligible: input.marked.slice(), excluded: [] };
  }
  const eligible: T[] = [];
  const excluded: T[] = [];
  for (const rec of input.marked) {
    if (input.reviewed.has(rec.id)) excluded.push(rec);
    else eligible.push(rec);
  }
  return { eligible, excluded };
}

export type CommitBatchInput = {
  action: BulkReviewAction;
  eligible: RecordWithPrimaryPrediction[];
  /** Required for `relabel`. Must match an exact configured label name. */
  label?: string;
};

export type CommitBatchResult =
  | { ok: true; batchId: string; affected: number }
  | { ok: false; reason: "no-prediction" | "unknown-label" | "missing-label" | "empty" };

function builtinIssueTypesFor(app: AppContext, recordId: string): BuiltinIssueType[] {
  const types: BuiltinIssueType[] = [];
  for (const issue of issuesForRecord(app.db, recordId)) {
    if (issue.source !== COMPUTED_SIGNAL_SOURCE) continue;
    if (isBuiltinIssueType(issue.type)) types.push(issue.type);
  }
  return types;
}

function knownLabel(app: AppContext, label: string): LabelConfigEntry | null {
  for (const entry of app.config.labels) {
    if (labelName(entry) === label) return entry;
  }
  return null;
}

type Plan = {
  recordId: string;
  status: LearningDecisionStatus | "skipped";
  finalLabel: string | null;
  prevLabel: string | null;
  issueTypes: BuiltinIssueType[];
};

/**
 * Commit a batch of Review decisions sharing one `batch_id`. Atomic — runs
 * inside a transaction so partial writes never escape. Bulk Review entries
 * always carry `source_of_truth = 'human'` (assistant exposure does not
 * propagate to batch entries). On success, clears `marked` from every
 * affected Record and credits smart-learning per non-skipped member.
 *
 * Caller is responsible for pre-filtering `eligible` via `selectBulkTargets`.
 */
export function commitBatch(
  app: AppContext,
  _queueId: QueueId,
  input: CommitBatchInput,
): CommitBatchResult {
  if (input.eligible.length === 0) return { ok: false, reason: "empty" };

  const plans: Plan[] = [];
  for (const rec of input.eligible) {
    const predicted = rec.primaryPrediction?.label ?? null;
    if (input.action === "accept") {
      if (!rec.primaryPrediction) return { ok: false, reason: "no-prediction" };
      plans.push({
        recordId: rec.id,
        status: "accepted",
        finalLabel: rec.primaryPrediction.label,
        prevLabel: null,
        issueTypes: builtinIssueTypesFor(app, rec.id),
      });
    } else if (input.action === "relabel") {
      if (!input.label) return { ok: false, reason: "missing-label" };
      if (!knownLabel(app, input.label)) return { ok: false, reason: "unknown-label" };
      const status: LearningDecisionStatus = predicted === input.label ? "accepted" : "relabeled";
      plans.push({
        recordId: rec.id,
        status,
        finalLabel: input.label,
        prevLabel: status === "relabeled" ? predicted : null,
        issueTypes: builtinIssueTypesFor(app, rec.id),
      });
    } else if (input.action === "reject") {
      plans.push({
        recordId: rec.id,
        status: "rejected",
        finalLabel: null,
        prevLabel: predicted,
        issueTypes: builtinIssueTypesFor(app, rec.id),
      });
    } else {
      plans.push({
        recordId: rec.id,
        status: "skipped",
        finalLabel: null,
        prevLabel: null,
        issueTypes: [],
      });
    }
  }

  const batchId = randomUUID();
  app.db.transaction((tx) => {
    for (const plan of plans) {
      // ADR 0004 exception: bulk Review entries always carry
      // `source_of_truth = 'human'` regardless of the per-record
      // `viewedAssistant` set. There is no focused record at batch-commit
      // time, so assistant exposure does not propagate to members.
      insertReview(tx, {
        record_id: plan.recordId,
        status: plan.status,
        final_label: plan.finalLabel,
        prev_label: plan.prevLabel,
        source_of_truth: "human",
        batch_id: batchId,
      });
    }
    tx.delete(recordTags)
      .where(
        and(
          eq(recordTags.tag, "marked"),
          inArray(
            recordTags.recordId,
            plans.map((p) => p.recordId),
          ),
        ),
      )
      .run();
  });

  // Order invariant: smart-learning credits run AFTER the DB transaction
  // commits, mirroring the single-record path in `overlay/effects.ts`. If
  // `recordDecision` ever grows a failure mode, the sampler may drift from
  // `effective_reviews` for that one decision — rare and bounded; cheaper
  // than wrapping the in-memory sampler in transaction-like ceremony.
  for (const plan of plans) {
    if (plan.status !== "skipped") {
      app.smartLearning.recordDecision(plan.status, plan.issueTypes);
    }
  }

  return { ok: true, batchId, affected: plans.length };
}

/**
 * Clear the `marked` Tag from every supplied Record, regardless of Review
 * state. Writes no Review rows. `:bulk unmark` per issue #94.
 */
export function commitBulkUnmark(app: AppContext, records: RecordWithPrimaryPrediction[]): number {
  if (records.length === 0) return 0;
  const ids = records.map((r) => r.id);
  return app.db.transaction((tx) => {
    const before = tx
      .select({ recordId: recordTags.recordId })
      .from(recordTags)
      .where(and(eq(recordTags.tag, "marked"), inArray(recordTags.recordId, ids)))
      .all();
    tx.delete(recordTags)
      .where(and(eq(recordTags.tag, "marked"), inArray(recordTags.recordId, ids)))
      .run();
    return before.length;
  });
}
