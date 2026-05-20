import type { AppContext } from "../../app/context.ts";
import { type BuiltinIssueType, isBuiltinIssueType } from "../../learning/smart-learning.ts";
import { fadeIn } from "../../render/anim.ts";
import { COMPUTED_SIGNAL_SOURCE, issuesForRecord } from "../../store/issues.ts";
import { effectiveReviewsInBatch, insertUndoEntry, latestReview } from "../../store/queries.ts";
import type { StoredReview } from "../../types.ts";
import type { Command } from "../command.ts";

function reverseLearning(ctx: AppContext, target: StoredReview): void {
  // `skipped` and `undone` never fed the sampler in the first place, so they
  // have nothing to reverse. ADR 0003.
  if (
    target.status !== "accepted" &&
    target.status !== "relabeled" &&
    target.status !== "rejected"
  ) {
    return;
  }
  const types: BuiltinIssueType[] = [];
  for (const issue of issuesForRecord(ctx.db, target.record_id)) {
    if (issue.source !== COMPUTED_SIGNAL_SOURCE) continue;
    if (isBuiltinIssueType(issue.type)) types.push(issue.type);
  }
  ctx.smartLearning.reverseDecision(target.status, types);
}

export const undo: Command = {
  name: "record.undo",
  scope: "review",
  bindings: { vim: "u" },
  enabled: (ctx) => ctx.cursor !== null,
  run: (ctx) => {
    const target = latestReview(ctx.db);
    if (!target) {
      ctx.setFlash("Nothing to undo", "warning");
      return;
    }
    // Batch path: when the latest effective Review carries a `batch_id`, undo
    // every effective member of that batch in one logical operation. Each
    // member gets its own compensating Review row so the audit log stays
    // honest and per-record. Smart-learning reverses per non-skipped member.
    if (target.batch_id) {
      const members = effectiveReviewsInBatch(ctx.db, target.batch_id);
      ctx.db.transaction((tx) => {
        for (const member of members) {
          insertUndoEntry(tx, member.record_id);
        }
      });
      for (const member of members) reverseLearning(ctx, member);
      ctx.cursor?.refresh();
      ctx.cursor?.seek(target.record_id);
      ctx.motion.play("record.restore", fadeIn(200));
      ctx.setFlash(`Undone batch of ${members.length} record(s)`, "success");
      return;
    }

    // Single-entry undo (unchanged): reverse the learning sample before
    // writing the compensating row so the upcoming smart-pending refresh
    // sees the corrected counters.
    reverseLearning(ctx, target);
    insertUndoEntry(ctx.db, target.record_id);
    ctx.cursor?.refresh();
    ctx.cursor?.seek(target.record_id);
    ctx.motion.play("record.restore", fadeIn(200));
  },
};
