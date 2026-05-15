import {
  bg as bgFn,
  type CliRenderer,
  fg as fgFn,
  StyledText,
  type TextChunk,
} from "@opentui/core";
import type { AppContext } from "../app/context.ts";
import { Box } from "../render/box.ts";
import { Chrome, type Segment } from "../render/chrome/index.ts";
import { segmentsToStyledText } from "../render/chrome/status-bar.ts";
import { Text, TextAttributes } from "../render/text.ts";
import { resolveTheme } from "../render/theme.ts";
import type { QueueId } from "../store/queues/registry.ts";
import { allStats, drillToQueue, type Section, type StatRow } from "../store/stats.ts";

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

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
      return "All records reviewed!";
  }
}

/**
 * Sections moved to the sidebar (`getSidebarData("stats")` carries the
 * Totals block: Total / Reviewed / Pending / Accepted / Relabeled /
 * Rejected / Skipped). Main pane only renders drillable / navigable
 * sections so the screen reads as a dataset debugger rather than a
 * counters dashboard. Plan E1.
 */
const SECTIONS_IN_SIDEBAR = new Set(["Progress", "Decisions"]);

function flatten(sections: Section[]): Line[] {
  const lines: Line[] = [];
  for (const s of sections) {
    if (SECTIONS_IN_SIDEBAR.has(s.label)) continue;
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

  const { sections } = allStats(app.db);
  const lines = flatten(sections);
  let highlight = firstDrillable(lines);

  const renderState = () => {
    // See queue.ts: scope set per-render so a render failure can't leave a
    // stale value behind.
    app.activeScope = "stats";
    for (const child of renderer.root.getChildren()) child.destroyRecursively();
    const theme = resolveTheme(app.display);
    const innerWidth = Math.max(40, renderer.terminalWidth - 8);
    const children: ReturnType<typeof Text>[] = [];
    lines.forEach((line, i) => {
      if (line.kind === "section-header") {
        children.push(Text({ content: "" }));
        children.push(sectionHeaderRow(app, line.label, innerWidth));
        children.push(Text({ content: "" }));
        return;
      }
      const isHighlighted = i === highlight;
      const drillable = line.drillTo !== null;
      children.push(statRow(app, line.display, drillable, isHighlighted, innerWidth, theme));
    });

    const statusLeft: Segment[] = [
      { text: " LabelLens", tone: "bold" },
      { text: "  ", tone: "dim" },
      { text: basename(app.config.input.path), tone: "muted" },
      { text: "  ", tone: "dim" },
      { text: "Stats", tone: "accent" },
    ];
    const drillableCount = lines.filter((l) => l.kind === "row" && l.drillTo !== null).length;
    const statusRight: Segment[] = [{ text: `${drillableCount} drillable rows `, tone: "muted" }];

    const footerHint: Segment[] = [
      { text: " [j/k] ", tone: "accent" },
      { text: "navigate  ", tone: "muted" },
      { text: "[enter] ", tone: "accent" },
      { text: "drill  ", tone: "muted" },
      { text: "[esc] ", tone: "accent" },
      { text: "back", tone: "muted" },
    ];

    renderer.root.add(
      Chrome({
        display: app.display,
        app,
        scope: "stats",
        statusLeft,
        statusRight,
        footerHint,
        width: renderer.terminalWidth,
        // Sidebar runs in stats-totals mode here — replaces the headline
        // counter rows that used to live at the top of the main pane.
        sidebar: app.getSidebarData("stats"),
        body: Box({ flexDirection: "column", flexGrow: 1, overflow: "hidden" }, ...children),
      }),
    );
  };

  /**
   * Section sub-header: muted title + dashed underline extending to the
   * right edge of the content column. Same pattern as the sidebar's
   * `Counters` / `Signals` heads — plan E3.
   */
  function sectionHeaderRow(
    app: AppContext,
    label: string,
    innerWidth: number,
  ): ReturnType<typeof Text> {
    const labelWithSpace = ` ${label} `;
    const ruleLen = Math.max(1, innerWidth - labelWithSpace.length);
    return Text({
      content: segmentsToStyledText(
        [
          { text: labelWithSpace, tone: "muted" },
          { text: "─".repeat(ruleLen), tone: "dim" },
        ],
        app.display,
      ),
    });
  }

  /**
   * Drillable row: ` <text>           →` with the chip right-anchored in
   * `fg.accentDeep`. Highlighted row gets the same solid-cyan-bg + inverse
   * fg treatment used for modal selections — plan E2. Non-drillable rows
   * dim out.
   */
  function statRow(
    app: AppContext,
    text: string,
    drillable: boolean,
    highlighted: boolean,
    innerWidth: number,
    theme: ReturnType<typeof resolveTheme>,
  ): ReturnType<typeof Text> {
    const supportsColor = app.display.color === "truecolor" || app.display.color === "256";
    const chip = drillable ? " →" : "  ";
    // Leading `> ` marker on highlighted rows in addition to the bg-bar.
    // The bg-bar carries the visual weight at truecolor, but `>` keeps the
    // highlight legible at mono / 16-color AND makes plain-text captures
    // (tests, copy/paste) detectable.
    const prefix = highlighted ? "> " : "  ";
    const visibleLen = prefix.length + text.length + chip.length;
    const gap = Math.max(1, innerWidth - visibleLen);
    const rowText = `${prefix}${text}${" ".repeat(gap)}${chip}`;

    if (highlighted && supportsColor) {
      const chunk: TextChunk = bgFn(theme.fg.accent)(fgFn(theme.bg.chrome)(rowText));
      return Text({
        content: new StyledText([chunk]),
        attributes: TextAttributes.BOLD,
      });
    }

    if (highlighted) {
      return Text({
        content: rowText,
        attributes: TextAttributes.BOLD | TextAttributes.INVERSE,
      });
    }

    const tone: Segment["tone"] = drillable ? "default" : "dim";
    const chipTone: Segment["tone"] = drillable ? "accentDeep" : "dim";
    return Text({
      content: segmentsToStyledText(
        [
          { text: prefix, tone: "dim" },
          { text, tone },
          { text: " ".repeat(gap), tone: "default" },
          { text: chip, tone: chipTone },
        ],
        app.display,
      ),
      attributes: drillable ? TextAttributes.NONE : TextAttributes.DIM,
    });
  }

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
    },
  };
}
