import { openStatsOverlay } from "../../overlay/stats-overlay.ts";
import { allStats } from "../../store/stats.ts";
import type { Command } from "../command.ts";

export function openStats(ctx: import("../../app/context.ts").AppContext): void {
  const { sections } = allStats(ctx.db);
  ctx.openOverlay({ kind: "stats", state: openStatsOverlay(sections) });
}

export const statsShow: Command = {
  name: "stats.show",
  scope: "review",
  bindings: { vim: "t" },
  hidden: true,
  footer: { label: "stats", order: 120, group: "utility" },
  run: openStats,
};

export const paletteStats: Command = {
  name: "palette.stats",
  scope: "global",
  palette: ":stats",
  paletteMetadata: { category: "actions", description: "Review statistics" },
  run: openStats,
};
