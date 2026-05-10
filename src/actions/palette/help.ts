import { loadManPage, manPageTopics } from "../../man/loader.ts";
import { openManPage } from "../../overlay/guidelines.ts";
import type { Command } from "../command.ts";

export const paletteHelp: Command = {
  name: "palette.help",
  scope: "global",
  palette: ":help",
  run: (ctx, argument) => {
    const topic = argument?.trim() ?? "";
    if (topic.length === 0) {
      ctx.setFlash(`topics: ${manPageTopics().join(", ")}`, "info", 5000);
      return;
    }
    const content = loadManPage(topic);
    if (content === null) {
      ctx.setFlash(
        `unknown help topic: ${topic} (try ${manPageTopics().join(", ")})`,
        "error",
        5000,
      );
      return;
    }
    ctx.openOverlay({ kind: "guidelines", state: openManPage({ topic, content }) });
  },
};
