import { openQueue } from "../../overlay/queue.ts";
import type { Command } from "../command.ts";

export const openQueueScreen: Command = {
  name: "queue.openScreen",
  scope: "review",
  bindings: { vim: "shift+q" },
  hidden: true,
  // Footer label is bare "queues"; the action-footer renderer appends the
  // resolved `queue.prev` / `queue.next` cycle keys as a `[‹/›]` suffix so
  // both presets stay accurate (vim: `[/]`, simple: `[←/→]`).
  footer: { label: "queues", order: 95, group: "utility" },
  enabled: () => true,
  run: (ctx) => {
    ctx.openOverlay({ kind: "queue", state: openQueue(ctx) });
  },
};
