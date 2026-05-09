import type { ReviewContext } from "../../app/context.ts";
import { toggleTag } from "../../store/tags.ts";
import type { Command } from "../command.ts";

export const toggleMark: Command<ReviewContext> = {
  name: "record.toggleMark",
  scope: "review",
  binding: "m",
  enabled: (ctx) => ctx.cursor.current() !== null,
  run: (ctx) => {
    const record = ctx.cursor.current();
    if (!record) return;
    toggleTag(ctx.db, record.id, "marked");
  },
};
