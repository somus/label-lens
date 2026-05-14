import type { Command } from "../command.ts";
import { openGuidelinesOverlay } from "../guidelines/show.ts";

export const paletteGuidelines: Command = {
  name: "palette.guidelines",
  scope: "global",
  palette: ":guidelines",
  paletteMetadata: { category: "help", description: "View task guide" },
  run: openGuidelinesOverlay,
};
