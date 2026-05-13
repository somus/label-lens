import type { Command } from "../command.ts";

function notYet(name: string, palette: string): Command {
  return {
    name,
    scope: "global",
    palette,
    run: (ctx) => {
      ctx.setFlash(`${palette}: not yet implemented`, "info", 3000);
    },
  };
}

export const paletteAssistant: Command = notYet("palette.assistant", ":assistant");
export const paletteReload: Command = notYet("palette.reload", ":reload");
