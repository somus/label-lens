import { toggleTag } from "../../store/tags.ts";
import type { Command } from "../command.ts";

export const toggleMark: Command = {
  name: "record.toggleMark",
  scope: "review",
  binding: "m",
  enabled: (ctx) => ctx.cursor?.current() != null,
  run: (ctx) => {
    const record = ctx.cursor?.current();
    if (!record) return;
    toggleTag(ctx.db, record.id, "marked");
    ctx.requestRender();
  },
};
