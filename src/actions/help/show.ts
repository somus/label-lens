import type { AppContext } from "../../app/context.ts";
import { openHelp } from "../../overlay/help.ts";
import type { Command } from "../command.ts";

export function openContextualHelp(ctx: AppContext): void {
  const registry = ctx.commandRegistry;
  if (!registry) {
    ctx.setFlash("help: command registry unavailable", "error");
    return;
  }
  const commands = Array.from(registry.values());
  const scope = ctx.activeScope ?? "review";
  ctx.openOverlay({ kind: "help", state: openHelp({ commands, scope }) });
}

export const helpShow: Command = {
  name: "help.show",
  scope: "global",
  binding: "?",
  footer: {
    label: "help",
    order: 130,
    scopes: ["review", "queue", "stats", "doc-view"],
    group: "utility",
  },
  run: openContextualHelp,
};
