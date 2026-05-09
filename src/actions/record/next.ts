import type { Command } from "../command.ts";

export const next: Command = {
  name: "record.next",
  scope: "review",
  binding: "j",
  enabled: (ctx) => ctx.cursor !== null,
  run: (ctx) => ctx.cursor?.next(),
};
