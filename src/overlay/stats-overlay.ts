import type { Section, StatRow } from "../store/stats.ts";
import type { OverlayEvent, ReduceResult } from "./types.ts";

export type StatsLine = {
  display: string;
  isHeader: boolean;
};

export type StatsOverlayState = {
  lines: StatsLine[];
  scroll: number;
};

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
    lines.push({ display: s.label, isHeader: true });
    for (const row of s.rows) {
      lines.push({ display: formatRow(row), isHeader: false });
    }
    lines.push({ display: "", isHeader: false });
  }
  return { lines, scroll: 0 };
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
    return {
      overlay: packed({
        ...state,
        scroll: Math.min(state.scroll + 1, Math.max(0, state.lines.length - 5)),
      }),
      effects: [],
    };
  }
  if (name === "up" || name === "k") {
    return {
      overlay: packed({ ...state, scroll: Math.max(state.scroll - 1, 0) }),
      effects: [],
    };
  }
  return { overlay: packed(state), effects: [] };
}
