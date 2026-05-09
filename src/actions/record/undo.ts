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
      ctx.setFlash("Nothing to undo", "error");
      return;
    }
    insertUndoEntry(ctx.db, target.record_id);
    ctx.cursor?.refresh();
    ctx.cursor?.seek(target.record_id);
  },
};
