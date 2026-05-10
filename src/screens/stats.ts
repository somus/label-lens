import type { CliRenderer } from "@opentui/core";
import type { AppContext } from "../app/context.ts";
import { Box } from "../render/box.ts";
import { Text, TextAttributes } from "../render/text.ts";
import type { QueueId } from "../store/queues/registry.ts";
import { allStats, drillToQueue, type Section, type StatRow } from "../store/stats.ts";

export type StatsScreenHandle = { destroy: () => void };

type Line =
  | { kind: "section-header"; label: string }
  | { kind: "row"; display: string; row: StatRow; drillTo: QueueId | null };

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatRow(row: StatRow): string {
  switch (row.kind) {
    case "progress": {
      const word = row.bucket.charAt(0).toUpperCase() + row.bucket.slice(1);
      return `${word}: ${row.count}`;
    }
    case "decision": {
      const word = row.status.charAt(0).toUpperCase() + row.status.slice(1);
      return `${word}: ${row.count}`;
    }
    case "acceptance-by-source":
    case "relabel-by-source":
    case "correction-rate-by-source":
      return `${row.source.padEnd(28, " ")} ${pct(row.rate).padStart(4, " ")}  (${row.reviewed} reviewed)`;
    case "relabel-by-reason":
      return `${row.reason.padEnd(28, " ")} ${pct(row.rate).padStart(4, " ")}  (${row.reviewed} reviewed)`;
    case "top-correction":
      return `${row.from} → ${row.to}`.padEnd(40, " ") + String(row.count);
    case "correction-rate-by-label":
      return `${row.prevLabel.padEnd(28, " ")} ${pct(row.rate).padStart(4, " ")}  (${row.reviewed} reviewed)`;
    case "imported-issue":
      return `${row.issueType.padEnd(32, " ")} ${row.count} record${row.count === 1 ? "" : "s"}`;
    case "suggested-next":
      return `${row.queueId}   (score ${row.score.toFixed(2)})`;
    case "all-caught-up":
      return "All caught up — try :export";
  }
}

function flatten(sections: Section[]): Line[] {
  const lines: Line[] = [];
  for (const s of sections) {
    lines.push({ kind: "section-header", label: s.label });
    for (const row of s.rows) {
      lines.push({ kind: "row", display: formatRow(row), row, drillTo: drillToQueue(row) });
    }
  }
  return lines;
}

function firstDrillable(lines: Line[]): number {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.kind === "row" && l.drillTo !== null) return i;
  }
  return -1;
}

function clampedDrillable(lines: Line[], from: number, dir: 1 | -1): number {
  let i = from + dir;
  while (i >= 0 && i < lines.length) {
    const l = lines[i]!;
    if (l.kind === "row" && l.drillTo !== null) return i;
    i += dir;
  }
  return from;
}

export function mountStatsScreen(args: {
  renderer: CliRenderer;
  app: AppContext;
  onDrill: (queueId: QueueId) => void;
  onCancel: () => void;
}): StatsScreenHandle {
  const { renderer, app, onDrill, onCancel } = args;
  const previousScope = app.activeScope;
  app.activeScope = "stats";

  const { sections } = allStats(app.db);
  const lines = flatten(sections);
  let highlight = firstDrillable(lines);

  const renderState = () => {
    for (const child of renderer.root.getChildren()) child.destroyRecursively();
    const children: ReturnType<typeof Text>[] = [];
    children.push(Text({ content: " Stats", attributes: TextAttributes.BOLD }));
    children.push(Text({ content: "" }));
    lines.forEach((line, i) => {
      if (line.kind === "section-header") {
        children.push(Text({ content: "" }));
        children.push(Text({ content: ` ${line.label}`, attributes: TextAttributes.BOLD }));
        return;
      }
      const isHighlighted = i === highlight;
      const marker = isHighlighted ? ">" : " ";
      const dim = line.drillTo === null && !isHighlighted;
      children.push(
        Text({
          content: ` ${marker} ${line.display}`,
          attributes: isHighlighted ? TextAttributes.BOLD : dim ? TextAttributes.DIM : undefined,
        }),
      );
    });

    renderer.root.add(
      Box(
        { flexDirection: "column", flexGrow: 1, padding: 1 },
        ...children,
        Box({ flexGrow: 1 }),
        Text({
          content: " j / k navigate · enter drill · esc / q back",
          attributes: TextAttributes.DIM,
        }),
      ),
    );
  };

  const onKey = (event: { name: string; ctrl: boolean; shift: boolean; meta: boolean }) => {
    switch (event.name) {
      case "j":
      case "down":
        if (highlight >= 0) highlight = clampedDrillable(lines, highlight, 1);
        renderState();
        return;
      case "k":
      case "up":
        if (highlight >= 0) highlight = clampedDrillable(lines, highlight, -1);
        renderState();
        return;
      case "return":
      case "enter": {
        const current = highlight >= 0 ? lines[highlight] : undefined;
        if (current && current.kind === "row" && current.drillTo !== null) {
          onDrill(current.drillTo);
        }
        return;
      }
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
      app.activeScope = previousScope;
    },
  };
}
