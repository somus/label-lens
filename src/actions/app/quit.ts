import type { AppContext } from "../../app/context.ts";
import type { Command } from "../command.ts";

export const quit: Command<AppContext> = {
  name: "app.quit",
  scope: "global",
  bindings: { vim: "q" },
  run: (ctx) => ctx.onQuit(),
};
