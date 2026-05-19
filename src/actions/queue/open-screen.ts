import { openQueue } from "../../overlay/queue.ts";
import type { Command } from "../command.ts";

export const openQueueScreen: Command = {
  name: "queue.openScreen",
  scope: "review",
  bindings: { vim: "shift+q" },
  hidden: true,
  // `[/]` suffix hints at the prev/next queue cycle keys (`[`, `]`) next
  // to the queue-screen binding — keeps both discoverable in one row.
  footer: { label: "queues [/]", order: 95, group: "utility" },
  enabled: () => true,
  run: (ctx) => {
    ctx.openOverlay({ kind: "queue", state: openQueue(ctx) });
  },
};
