import type { QueueId } from "../store/queues/registry.ts";
import { drillToQueue, type Section, type StatRow } from "../store/stats.ts";
import type { OverlayEvent, ReduceResult } from "./types.ts";

export type StatsLine =
  | { kind: "section-header"; label: string }
  | { kind: "row"; display: string; row: StatRow; drillTo: QueueId | null };

export type StatsOverlayState = {
  lines: StatsLine[];
  highlight: number;
  scroll: number;
};

const STATS_PAGE = 20;
const SECTIONS_IN_SIDEBAR = new Set(["Progress", "Decisions"]);

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatRow(row: StatRow): string {
  switch (row.kind) {
    case "progress": {
      const word = row.bucket.charAt(0).toUpperCase() + row.bucket.slice(1);
      return `  ${word}: ${row.count}`;
    }
    case "decision": {
      const word = row.status.charAt(0).toUpperCase() + row.status.slice(1);
      return `  ${word}: ${row.count}`;
    }
    case "acceptance-by-source":
    case "relabel-by-source":
    case "correction-rate-by-source":
      return `  ${row.source.padEnd(24)} ${pct(row.rate).padStart(4)}  (${row.reviewed} reviewed)`;
    case "relabel-by-reason":
      return `  ${row.reason.padEnd(24)} ${pct(row.rate).padStart(4)}  (${row.reviewed} reviewed)`;
    case "top-correction":
      return `  ${row.from} → ${row.to}`.padEnd(36) + String(row.count);
    case "correction-rate-by-label":
      return `  ${row.prevLabel.padEnd(24)} ${pct(row.rate).padStart(4)}  (${row.reviewed} reviewed)`;
    case "imported-issue":
      return `  ${row.issueType.padEnd(28)} ${row.count} record${row.count === 1 ? "" : "s"}`;
    case "suggested-next":
      return `  ${row.queueId}   (score ${row.score.toFixed(2)})`;
    case "all-caught-up":
      return "  All records reviewed!";
  }
}

export function openStatsOverlay(sections: Section[]): StatsOverlayState {
  const lines: StatsLine[] = [];
  for (const s of sections) {
    if (SECTIONS_IN_SIDEBAR.has(s.label)) continue;
    lines.push({ kind: "section-header", label: s.label });
    for (const row of s.rows) {
      lines.push({ kind: "row", display: formatRow(row), row, drillTo: drillToQueue(row) });
    }
  }
  return { lines, highlight: firstDrillable(lines), scroll: 0 };
}

function packed(state: StatsOverlayState): { kind: "stats"; state: StatsOverlayState } {
  return { kind: "stats", state };
}

export function reduceStatsOverlay(state: StatsOverlayState, event: OverlayEvent): ReduceResult {
  if (event.kind === "cancel") return { overlay: null, effects: [{ kind: "close" }] };
  if (event.kind !== "key") return { overlay: packed(state), effects: [] };

  const name = event.event.name;
  if (name === "escape" || name === "q") return { overlay: null, effects: [{ kind: "close" }] };

  if (name === "down" || name === "j") {
    const highlight =
      state.highlight >= 0 ? clampedDrillable(state.lines, state.highlight, 1) : state.highlight;
    return {
      overlay: packed({
        ...state,
        highlight,
        scroll: scrollForHighlight(state.scroll, highlight),
      }),
      effects: [],
    };
  }
  if (name === "up" || name === "k") {
    const highlight =
      state.highlight >= 0 ? clampedDrillable(state.lines, state.highlight, -1) : state.highlight;
    return {
      overlay: packed({ ...state, highlight, scroll: scrollForHighlight(state.scroll, highlight) }),
      effects: [],
    };
  }
  if (name === "return" || name === "enter") {
    const line = state.highlight >= 0 ? state.lines[state.highlight] : undefined;
    if (line?.kind === "row" && line.drillTo !== null) {
      return { overlay: null, effects: [{ kind: "drill", queueId: line.drillTo }] };
    }
    return { overlay: packed(state), effects: [] };
  }
  return { overlay: packed(state), effects: [], propagated: true };
}

function firstDrillable(lines: StatsLine[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.kind === "row" && line.drillTo !== null) return i;
  }
  return -1;
}

function clampedDrillable(lines: StatsLine[], from: number, dir: 1 | -1): number {
  let i = from + dir;
  while (i >= 0 && i < lines.length) {
    const line = lines[i]!;
    if (line.kind === "row" && line.drillTo !== null) return i;
    i += dir;
  }
  return from;
}

function scrollForHighlight(scroll: number, highlight: number): number {
  if (highlight < 0) return scroll;
  if (highlight < scroll) return highlight;
  if (highlight >= scroll + STATS_PAGE) return highlight - STATS_PAGE + 1;
  return scroll;
}
