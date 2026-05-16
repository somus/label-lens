import type { Command } from "../command.ts";

function notYet(name: string, palette: string): Command {
  return {
    name,
    scope: "global",
    palette,
    paletteMetadata: { category: "actions" },
    run: (ctx) => {
      ctx.setFlash(`${palette}: not yet implemented`, "warning");
    },
  };
}

export const paletteAssistant: Command = notYet("palette.assistant", ":assistant");
export const paletteReload: Command = notYet("palette.reload", ":reload");
