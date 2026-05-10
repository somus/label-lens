import { openPalette } from "../../overlay/palette.ts";
import type { Command } from "../command.ts";

export const paletteOpen: Command = {
  name: "palette.open",
  scope: "global",
  binding: ":",
  hidden: true,
  run: (ctx) => {
    const registry = ctx.commandRegistry;
    if (!registry) {
      ctx.setFlash("palette: command registry unavailable", "error");
      return;
    }
    const commands = Array.from(registry.values());
    const scope = ctx.activeScope ?? "review";
    ctx.openOverlay({
      kind: "palette",
      state: openPalette({ commands, scope, history: ctx.paletteHistory.slice() }),
    });
  },
};
