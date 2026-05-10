import type { CliRenderer } from "@opentui/core";
import type { AppContext } from "../app/context.ts";
import { Box } from "../render/box.ts";
import { Text, TextAttributes } from "../render/text.ts";
import { queueCount } from "../store/queues/queue-counts.ts";
import { QUEUE_CYCLE, resolveQueue } from "../store/queues/registry.ts";

export type QueueScreenHandle = { destroy: () => void };

type Row = { id: string; label: string; count: number };

export function mountQueueScreen(args: {
  renderer: CliRenderer;
  app: AppContext;
  onSelect: (queueId: string) => void;
  onCancel: () => void;
}): QueueScreenHandle {
  const { renderer, app, onSelect, onCancel } = args;

  const rows: Row[] = QUEUE_CYCLE.map((id) => {
    const def = resolveQueue(id);
    return { id, label: def.label, count: queueCount(app.db, def) };
  });

  let highlight = Math.max(
    0,
    rows.findIndex((r) => r.id === app.queueId),
  );
  if (highlight < 0) highlight = 0;
  const longestLabel = rows.reduce((m, r) => Math.max(m, r.label.length), 0);

  const renderState = () => {
    for (const child of renderer.root.getChildren()) child.destroyRecursively();
    renderer.root.add(
      Box(
        { flexDirection: "column", flexGrow: 1, padding: 1 },
        Text({ content: " Queues", attributes: TextAttributes.BOLD }),
        Box({ height: 1 }),
        ...rows.map((r, i) => {
          const marker = i === highlight ? ">" : " ";
          const padded = r.label.padEnd(longestLabel + 2, " ");
          return Text({
            content: ` ${marker} ${padded}${r.count}`,
            attributes: i === highlight ? TextAttributes.BOLD : TextAttributes.DIM,
          });
        }),
        Box({ flexGrow: 1 }),
        Text({
          content: " j / k navigate · enter select · esc / q cancel",
          attributes: TextAttributes.DIM,
        }),
      ),
    );
  };

  const onKey = (event: { name: string; ctrl: boolean; shift: boolean; meta: boolean }) => {
    switch (event.name) {
      case "j":
      case "down":
        highlight = Math.min(rows.length - 1, highlight + 1);
        renderState();
        return;
      case "k":
      case "up":
        highlight = Math.max(0, highlight - 1);
        renderState();
        return;
      case "return":
      case "enter":
        onSelect(rows[highlight]!.id);
        return;
      case "escape":
      case "q":
        onCancel();
        return;
    }
  };

  const onResize = () => renderState();
  renderer.keyInput.on("keypress", onKey);
  renderer.on("resize", onResize);
  renderState();

  return {
    destroy: () => {
      renderer.keyInput.off("keypress", onKey);
      renderer.off("resize", onResize);
    },
  };
}
