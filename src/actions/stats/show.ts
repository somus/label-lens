import type { Command } from "../command.ts";

export const statsShow: Command = {
  name: "stats.show",
  scope: "review",
  binding: "t",
  palette: "Show stats",
  footer: { label: "stats", order: 120 },
  run: (ctx) => {
    if (!ctx.openStatsScreen) {
      ctx.setFlash("Stats screen unavailable", "info", 1200);
      return;
    }
    ctx.openStatsScreen();
  },
};

export const paletteStats: Command = {
  name: "palette.stats",
  scope: "global",
  palette: "Stats",
  run: (ctx) => {
    if (!ctx.openStatsScreen) {
      ctx.setFlash("Stats screen unavailable", "info", 1200);
      return;
    }
    ctx.openStatsScreen();
  },
};
