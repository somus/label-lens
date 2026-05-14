import { loadManPage, manPageTopics } from "../../man/loader.ts";
import { openManPage } from "../../overlay/guidelines.ts";
import { openPicker } from "../../overlay/palette-picker.ts";
import type { Command } from "../command.ts";
import { openContextualHelp } from "../help/show.ts";

export const paletteHelp: Command = {
  name: "palette.help",
  scope: "global",
  palette: ":help",
  paletteMetadata: { category: "help", description: "Help" },
  run: (ctx, argument) => {
    const topic = argument?.trim() ?? "";
    if (topic.length === 0) {
      openContextualHelp(ctx);
      return;
    }
    if (topic === "topics") {
      const registry = ctx.commandRegistry;
      if (!registry) {
        ctx.setFlash("help: command registry unavailable", "error");
        return;
      }
      const commands = Array.from(registry.values());
      ctx.openOverlay({
        kind: "palette",
        state: {
          filter: "help topics",
          entries: [{ commandName: "palette.help", palette: ":help" }],
          highlight: 0,
          historyIdx: null,
          history: ctx.paletteHistory.slice(),
          allEntries: [{ commandName: "palette.help", palette: ":help" }],
          mode: "pick",
          categories: [],
          picker: openPicker("palette.help", "topic", manPageTopics()),
          counts: new Map(),
          pickerOptions: null,
          commands,
        },
      });
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
