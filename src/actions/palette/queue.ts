import type { QueueId } from "../../store/queues/registry.ts";
import { resolveQueue } from "../../store/queues/registry.ts";
import { WhereParseError } from "../../store/where-parser.ts";
import type { Command } from "../command.ts";
import { switchQueue } from "../queue/switch.ts";

function trySwitch(ctx: import("../../app/context.ts").AppContext, id: string): void {
  try {
    resolveQueue(id as QueueId);
  } catch (err) {
    const message = err instanceof WhereParseError ? err.message : String(err);
    ctx.setFlash(`unknown queue: ${id} (${message})`, "error", 5000);
    return;
  }
  switchQueue(ctx, id as QueueId);
}

function parametric(stem: string, prefix?: string): Command {
  return {
    name: `palette.${stem}`,
    scope: "global",
    palette: `:${stem}`,
    run: (ctx, argument) => {
      const arg = argument?.trim() ?? "";
      if (arg.length === 0) {
        ctx.setFlash(`:${stem} requires an argument`, "error", 5000);
        return;
      }
      const id = prefix === undefined ? arg : `${prefix}:${arg}`;
      trySwitch(ctx, id);
    },
  };
}

export const paletteQueue: Command = parametric("queue");
export const paletteBySource: Command = parametric("by-source", "by-source");
export const paletteByReason: Command = parametric("by-reason", "by-reason");
export const paletteByLabel: Command = parametric("by-label", "by-label");
export const paletteByIssue: Command = parametric("by-issue", "by-issue");
export const paletteByCorrection: Command = parametric("by-correction", "by-correction");
export const paletteWhere: Command = parametric("where", "where");

export const paletteMarked: Command = {
  name: "palette.marked",
  scope: "global",
  palette: ":marked",
  run: (ctx) => trySwitch(ctx, "marked"),
};
