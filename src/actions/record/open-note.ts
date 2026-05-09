import type { ReviewContext } from "../../app/context.ts";
import type { Command } from "../command.ts";

export const openNote: Command<ReviewContext> = {
  name: "record.openNote",
  scope: "review",
  binding: "n",
  enabled: (ctx) => ctx.cursor.current() !== null,
  run: (ctx) => {
    const record = ctx.cursor.current();
    if (!record) return;
    ctx.enterNote({
      recordId: record.id,
      value: record.note ?? "",
    });
  },
};
