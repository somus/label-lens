import type { Command } from "../command.ts";

/**
 * `:toggle-sidebar` (plan A6). Flips `display.sidebar` between `on` and
 * `off` for the current session. Does not persist to
 * `labellens.config.json` — reviewer can pin a preference there via
 * `display.sidebar`. Useful at terminal widths near the 120-col threshold
 * where `auto` waffles, or when the reviewer wants the top status bar
 * back temporarily.
 */
export const paletteToggleSidebar: Command = {
  name: "palette.toggleSidebar",
  scope: "global",
  palette: ":toggle-sidebar",
  paletteMetadata: { category: "actions", description: "Toggle sidebar" },
  run: (ctx) => {
    const current = ctx.display.sidebar;
    ctx.display.sidebar = current === "off" ? "on" : "off";
    ctx.setFlash(ctx.display.sidebar === "on" ? "Sidebar on" : "Sidebar off", "info");
    ctx.requestRender();
  },
};
