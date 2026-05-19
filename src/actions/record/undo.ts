import { type BuiltinIssueType, isBuiltinIssueType } from "../../learning/smart-learning.ts";
import { fadeIn } from "../../render/anim.ts";
import { COMPUTED_SIGNAL_SOURCE, issuesForRecord } from "../../store/issues.ts";
import { insertUndoEntry, latestReview } from "../../store/queries.ts";
import type { Command } from "../command.ts";

export const undo: Command = {
  name: "record.undo",
  scope: "review",
  binding: "u",
  enabled: (ctx) => ctx.cursor !== null,
  run: (ctx) => {
    const target = latestReview(ctx.db);
    if (!target) {
      ctx.setFlash("Nothing to undo", "warning");
      return;
    }
    // Reverse the learning sample before writing the compensating row so the
    // upcoming smart-pending refresh sees the corrected counters. `pending` is
    // unreachable here — `latestReview` reads from `effective_reviews` (ADR
    // 0007), which only surfaces committed-decision rows. `skipped` and
    // `undone` never fed the sampler in the first place, so they have nothing
    // to reverse.
    if (
      target.status === "accepted" ||
      target.status === "relabeled" ||
      target.status === "rejected"
    ) {
      const types: BuiltinIssueType[] = [];
      for (const issue of issuesForRecord(ctx.db, target.record_id)) {
        if (issue.source !== COMPUTED_SIGNAL_SOURCE) continue;
        if (isBuiltinIssueType(issue.type)) types.push(issue.type);
      }
      ctx.smartLearning.reverseDecision(target.status, types);
    }
    insertUndoEntry(ctx.db, target.record_id);
    ctx.cursor?.refresh();
    ctx.cursor?.seek(target.record_id);
    ctx.motion.play("record.restore", fadeIn(200));
  },
};
