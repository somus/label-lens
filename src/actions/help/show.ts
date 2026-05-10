import { openHelp } from "../../overlay/help.ts";
import type { Command } from "../command.ts";

export const helpShow: Command = {
  name: "help.show",
  scope: "global",
  binding: "?",
  run: (ctx) => {
    const registry = ctx.commandRegistry;
    if (!registry) {
      ctx.setFlash("help: command registry unavailable", "error");
      return;
    }
    const commands = Array.from(registry.values());
    const scope = ctx.activeScope ?? "review";
    ctx.openOverlay({ kind: "help", state: openHelp({ commands, scope }) });
  },
};
