import { flash } from "../../render/anim.ts";
import { hasTag, toggleTag } from "../../store/tags.ts";
import type { Command } from "../command.ts";

export const toggleMark: Command = {
  name: "record.toggleMark",
  scope: "review",
  bindings: { vim: "m" },
  enabled: (ctx) => ctx.cursor?.current() != null,
  run: (ctx) => {
    const record = ctx.cursor?.current();
    if (!record) return;
    toggleTag(ctx.db, record.id, "marked");
    // Increment session counter only on the on-edge, to match what reviewers
    // expect ("how many marks did I add this session"). Re-querying after
    // toggle keeps the counter aligned with the actual stored state.
    if (hasTag(ctx.db, record.id, "marked")) {
      ctx.sessionCounters.marked += 1;
      ctx.motion.play("sidebar.counter.marked", flash(200, "accent"));
    }
    ctx.requestRender();
  },
};
