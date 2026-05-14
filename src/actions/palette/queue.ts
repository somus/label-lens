import type { QueueId } from "../../store/queues/registry.ts";
import { resolveQueue } from "../../store/queues/registry.ts";
import { WhereParseError } from "../../store/where-parser.ts";
import type { Command, PaletteMetadata } from "../command.ts";
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

function parametric(stem: string, meta: PaletteMetadata, prefix?: string): Command {
  return {
    name: `palette.${stem}`,
    scope: "global",
    palette: `:${stem}`,
    paletteMetadata: meta,
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

export const paletteQueue: Command = {
  name: "palette.queue",
  scope: "global",
  palette: ":queue",
  paletteMetadata: {
    category: "queues",
    description: "Open queues, or switch by name",
  },
  run: (ctx, argument) => {
    const arg = argument?.trim() ?? "";
    if (arg.length === 0) {
      if (!ctx.openQueueScreen) {
        ctx.setFlash("Queue screen unavailable", "info", 1200);
        return;
      }
      ctx.openQueueScreen();
      return;
    }
    trySwitch(ctx, arg);
  },
};

export const paletteBySource: Command = parametric(
  "by-source",
  { category: "filters", arity: 1, pickerKind: "source", description: "Filter by source" },
  "by-source",
);

export const paletteByReason: Command = parametric(
  "by-reason",
  { category: "filters", arity: 1, pickerKind: "reason", description: "Filter by reason" },
  "by-reason",
);

export const paletteByLabel: Command = parametric(
  "by-label",
  { category: "filters", arity: 1, pickerKind: "label", description: "Filter by label" },
  "by-label",
);

export const paletteByIssue: Command = parametric(
  "by-issue",
  { category: "filters", arity: 1, pickerKind: "issue", description: "Filter by issue type" },
  "by-issue",
);

export const paletteByCorrection: Command = parametric(
  "by-correction",
  { category: "filters", arity: 1, pickerKind: "correction", description: "Relabel drilldown" },
  "by-correction",
);

export const paletteWhere: Command = parametric(
  "where",
  { category: "filters", arity: 1, description: "Custom SQL filter" },
  "where",
);

export const paletteMarked: Command = {
  name: "palette.marked",
  scope: "global",
  palette: ":marked",
  paletteMetadata: { category: "queues", arity: 0, description: "Marked records" },
  run: (ctx) => trySwitch(ctx, "marked"),
};
