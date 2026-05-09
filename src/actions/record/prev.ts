import type { ReviewContext } from "../../app/context.ts";
import type { Command } from "../command.ts";

export const prev: Command<ReviewContext> = {
  name: "record.prev",
  scope: "review",
  binding: "k",
  run: (ctx) => ctx.cursor.prev(),
};
