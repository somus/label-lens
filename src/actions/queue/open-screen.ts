import type { Command } from "../command.ts";

export const openQueueScreen: Command = {
  name: "queue.openScreen",
  scope: "review",
  binding: "shift+q",
  palette: "Open queue screen",
  enabled: () => true,
  run: (ctx) => {
    if (!ctx.openQueueScreen) {
      ctx.setFlash("Queue screen unavailable", "info", 1200);
      return;
    }
    ctx.openQueueScreen();
  },
};
