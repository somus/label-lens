import type { ReviewContext } from "../../app/context.ts";
import type { Command } from "../command.ts";

export const next: Command<ReviewContext> = {
  name: "record.next",
  scope: "review",
  binding: "j",
  run: (ctx) => ctx.cursor.next(),
};
