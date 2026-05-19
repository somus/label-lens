import { labelName } from "../../config/config.ts";
import { openPaletteV2 } from "../../overlay/palette.ts";
import { fadeIn } from "../../render/anim.ts";
import type { Command } from "../command.ts";

export const paletteOpen: Command = {
  name: "palette.open",
  scope: "global",
  bindings: { vim: ":", simple: "ctrl+p" },
  hidden: true,
  footer: {
    label: "palette",
    order: 110,
    scopes: ["review", "queue", "stats", "doc-view"],
    group: "utility",
  },
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
      state: openPaletteV2({
        commands,
        scope,
        history: ctx.paletteHistory.slice(),
        db: ctx.db,
        labels: ctx.config.labels.map(labelName),
      }),
    });
    ctx.motion.play("palette.open", fadeIn(150));
  },
};
