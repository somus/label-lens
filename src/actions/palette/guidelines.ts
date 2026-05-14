import { openGuidelines } from "../../overlay/guidelines.ts";
import type { Command } from "../command.ts";

export const paletteGuidelines: Command = {
  name: "palette.guidelines",
  scope: "global",
  palette: ":guidelines",
  paletteMetadata: { category: "help", description: "View task guide" },
  run: (ctx) => {
    ctx.openOverlay({ kind: "guidelines", state: openGuidelines(ctx.config) });
  },
};
