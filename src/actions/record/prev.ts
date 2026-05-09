import type { Command } from "../command.ts";

export const prev: Command = {
  name: "record.prev",
  scope: "review",
  binding: "k",
  enabled: (ctx) => ctx.cursor !== null,
  run: (ctx) => ctx.cursor?.prev(),
};
