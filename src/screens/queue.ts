import type { CliRenderer } from "@opentui/core";
import { sql } from "drizzle-orm";
import type { AppContext } from "../app/context.ts";
import { Box } from "../render/box.ts";
import { Chrome, type Segment } from "../render/chrome/index.ts";
import { segmentsToStyledText } from "../render/chrome/status-bar.ts";
import { progressSegments } from "../render/progress-segments.ts";
import { Text, TextAttributes } from "../render/text.ts";
import { queueCount } from "../store/queues/queue-counts.ts";
import { QUEUE_CYCLE, type QueueId, resolveQueue } from "../store/queues/registry.ts";
import { records } from "../store/schema.ts";

export type QueueScreenHandle = { destroy: () => void };

type Row = { id: QueueId; label: string; description: string; count: number };
type Section = { title: string; icon: string; rows: Row[] };

const NARROW_WIDTH = 60;
const PROGRESS_WIDTH = 8;

const QUEUE_DESCRIPTIONS: Record<string, string> = {
  pending: "Awaiting your label",
  skipped: "Reviewed but punted",
  marked: "Flagged for follow-up via [m]",
  "low-confidence": "Predictions with the weakest scores",
  disagreements: "Sources predict different labels",
  flagged: "Imported or computed signals",
};

const QUEUE_SECTIONS: Array<{ title: string; icon: string; ids: QueueId[] }> = [
  { title: "Review Queues", icon: "⊞", ids: ["pending", "skipped", "marked"] },
  { title: "Signal Queues", icon: "◆", ids: ["low-confidence", "disagreements", "flagged"] },
];

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

function totalRecordCount(app: AppContext): number {
  return app.db.select({ n: sql<number>`COUNT(*)` }).from(records).get()?.n ?? 0;
}

export function mountQueueScreen(args: {
  renderer: CliRenderer;
  app: AppContext;
  onSelect: (queueId: string) => void;
  onCancel: () => void;
}): QueueScreenHandle {
  const { renderer, app, onSelect, onCancel } = args;

  const total = totalRecordCount(app);

  const sections: Section[] = QUEUE_SECTIONS.filter((sec) =>
    sec.ids.some((id) => QUEUE_CYCLE.includes(id)),
  ).map((sec) => ({
    title: sec.title,
    icon: sec.icon,
    rows: sec.ids
      .filter((id) => QUEUE_CYCLE.includes(id))
      .map((id) => {
        const def = resolveQueue(id);
        return {
          id,
          label: def.label,
          description: QUEUE_DESCRIPTIONS[id] ?? "",
          count: queueCount(app.db, def),
        };
      }),
  }));

  const flatRows: Row[] = sections.flatMap((s) => s.rows);
  let highlight = Math.max(
    0,
    flatRows.findIndex((r) => r.id === app.queueId),
  );
  const longestLabel = flatRows.reduce((m, r) => Math.max(m, r.label.length), 0);

  const renderState = () => {
    // Scope is set on every render so a thrown error mid-mount can't leave a
    // stale value behind. The next screen's render takes over immediately.
    app.activeScope = "queue";
    for (const child of renderer.root.getChildren()) child.destroyRecursively();

    const useColor = app.display.color === "truecolor" || app.display.color === "256";
    const width = renderer.terminalWidth;
    const innerWidth = Math.max(20, width - 2);
    const showProgress = innerWidth >= NARROW_WIDTH;

    const statusLeft: Segment[] = [
      { text: " LabelLens", tone: "bold" },
      { text: "  ", tone: "dim" },
      { text: basename(app.config.input.path), tone: "muted" },
      { text: "  ", tone: "dim" },
      { text: "Queues", tone: "accent" },
    ];
    const statusRight: Segment[] = [{ text: `${flatRows.length} queues `, tone: "muted" }];

    let rowIndex = 0;
    const sectionBlocks: ReturnType<typeof Box>[] = [];
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx]!;
      const heading = useColor ? ` ${section.icon}  ${section.title}` : ` ${section.title}`;
      const sectionChildren: ReturnType<typeof Text>[] = [
        Text({ content: heading, attributes: TextAttributes.BOLD }),
      ];
      for (const row of section.rows) {
        const isHighlight = rowIndex === highlight;
        const marker = isHighlight ? ">" : " ";
        const paddedLabel = row.label.padEnd(longestLabel, " ");
        const countText = String(row.count);
        const countTone: Segment["tone"] = row.count > 0 ? "accent" : "dim";
        const segs: Segment[] = [
          { text: ` ${marker} `, tone: isHighlight ? "accent" : "default" },
          {
            text: paddedLabel,
            tone: isHighlight ? "accent" : row.count > 0 ? "default" : "dim",
          },
          { text: "  ", tone: "dim" },
          { text: countText.padStart(4, " "), tone: countTone },
        ];
        if (showProgress) {
          segs.push({ text: "  ", tone: "dim" });
          segs.push(...progressSegments(row.count, total, PROGRESS_WIDTH, app.display));
        }
        if (row.description) {
          segs.push({ text: "  ", tone: "dim" });
          segs.push({ text: row.description, tone: "dim" });
        }
        sectionChildren.push(
          Text({
            content: segmentsToStyledText(segs, app.display),
            attributes: isHighlight ? TextAttributes.BOLD : TextAttributes.NONE,
            wrapMode: "char",
          }),
        );
        rowIndex++;
      }
      sectionBlocks.push(Box({ flexDirection: "column" }, ...sectionChildren));
      if (sIdx < sections.length - 1) {
        sectionBlocks.push(Box({ height: 1 }));
      }
    }

    const body = Box(
      { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
      ...sectionBlocks,
    );

    const footerHint: Segment[] = [
      { text: " [j/k] ", tone: "accent" },
      { text: "navigate", tone: "muted" },
      { text: " ┊", tone: "dim" },
      { text: " [enter] ", tone: "accent" },
      { text: "select", tone: "muted" },
      { text: " ┊", tone: "dim" },
      { text: " [esc] ", tone: "accent" },
      { text: "cancel", tone: "muted" },
    ];

    renderer.root.add(
      Chrome({
        display: app.display,
        app,
        scope: "queue",
        statusLeft,
        statusRight,
        footerHint,
        width: renderer.terminalWidth,
        body,
      }),
    );
  };

  const select = () => {
    const row = flatRows[highlight];
    if (!row) return;
    if (row.count === 0) {
      app.setFlash(`${row.label} is empty (0 records). Press [j/k] to pick another queue.`, "info");
      renderState();
      return;
    }
    onSelect(row.id);
  };

  const onKey = (event: { name: string; ctrl: boolean; shift: boolean; meta: boolean }) => {
    app.noteInput();
    switch (event.name) {
      case "j":
      case "down":
        highlight = Math.min(flatRows.length - 1, highlight + 1);
        renderState();
        return;
      case "k":
      case "up":
        highlight = Math.max(0, highlight - 1);
        renderState();
        return;
      case "return":
      case "enter":
        select();
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
