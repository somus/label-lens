import { openQueue } from "../../overlay/queue.ts";
import type { Command } from "../command.ts";

export const openQueueScreen: Command = {
  name: "queue.openScreen",
  scope: "review",
  binding: "shift+q",
  hidden: true,
  footer: { label: "queues", order: 95, group: "utility" },
  enabled: () => true,
  run: (ctx) => {
    ctx.openOverlay({ kind: "queue", state: openQueue(ctx) });
  },
};
