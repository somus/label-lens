import { openGuidelines } from "../../overlay/guidelines.ts";
import type { Command } from "../command.ts";

export const guidelinesShow: Command = {
  name: "guidelines.show",
  scope: "global",
  binding: "g g",
  run: (ctx) => {
    ctx.openOverlay({ kind: "guidelines", state: openGuidelines(ctx.config) });
  },
};
