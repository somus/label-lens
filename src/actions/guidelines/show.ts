import type { AppContext } from "../../app/context.ts";
import { openGuidelines } from "../../overlay/guidelines.ts";
import type { Command } from "../command.ts";

export function openGuidelinesOverlay(ctx: AppContext): void {
  ctx.openOverlay({ kind: "guidelines", state: openGuidelines(ctx.config) });
}

export const guidelinesShow: Command = {
  name: "guidelines.show",
  scope: "global",
  bindings: { vim: "g g", simple: "g" },
  run: openGuidelinesOverlay,
};
