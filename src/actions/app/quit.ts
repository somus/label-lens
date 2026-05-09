import type { AppContext } from "../../app/context.ts";
import type { Command } from "../command.ts";

export const quit: Command<AppContext> = {
  name: "app.quit",
  scope: "global",
  binding: "q",
  run: (ctx) => ctx.onQuit(),
};
