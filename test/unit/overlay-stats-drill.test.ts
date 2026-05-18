import { describe, expect, test } from "bun:test";
import type { StatsOverlayState } from "../../src/overlay/stats-overlay.ts";
import { openStatsOverlay, reduceStatsOverlay } from "../../src/overlay/stats-overlay.ts";
import type { Section } from "../../src/store/stats.ts";

function key(name: string) {
  return { kind: "key" as const, event: { name } };
}

const sections: Section[] = [
  {
    label: "Progress",
    rows: [{ kind: "progress", bucket: "total", count: 10 }],
  },
  {
    label: "By source",
    rows: [
      { kind: "acceptance-by-source", source: "rule.a", rate: 0.5, reviewed: 2 },
      { kind: "all-caught-up" },
      { kind: "relabel-by-source", source: "rule.b", rate: 0.75, reviewed: 4 },
    ],
  },
  {
    label: "Top corrections",
    rows: [{ kind: "top-correction", from: "food", to: "travel", count: 3 }],
  },
];

function statsState(result: ReturnType<typeof reduceStatsOverlay>): StatsOverlayState {
  if (result.overlay?.kind !== "stats") throw new Error("expected stats overlay");
  return result.overlay.state;
}

function highlightedDisplay(state: StatsOverlayState): string {
  const line = state.lines[state.highlight];
  if (line?.kind !== "row") throw new Error("expected highlighted row");
  return line.display;
}

describe("stats overlay drill reducer", () => {
  test("opens with the first drillable stat row highlighted", () => {
    const state = openStatsOverlay(sections);
    const highlighted = state.lines[state.highlight];

    expect(highlighted?.kind).toBe("row");
    if (highlighted?.kind === "row") {
      expect(highlighted.drillTo).toBe("by-source:rule.a");
    }
  });

  test("j/k move highlight only between drillable stat rows", () => {
    let state = openStatsOverlay(sections);

    state = statsState(reduceStatsOverlay(state, key("j")));
    expect(highlightedDisplay(state)).toContain("rule.b");

    state = statsState(reduceStatsOverlay(state, key("j")));
    expect(highlightedDisplay(state)).toContain("food");

    state = statsState(reduceStatsOverlay(state, key("k")));
    expect(highlightedDisplay(state)).toContain("rule.b");
  });

  test("enter emits a drill effect for the highlighted stat row", () => {
    let state = openStatsOverlay(sections);
    state = statsState(reduceStatsOverlay(state, key("j")));
    state = statsState(reduceStatsOverlay(state, key("j")));

    const result = reduceStatsOverlay(state, key("enter"));

    expect(result.overlay).toBeNull();
    expect(result.effects).toEqual([{ kind: "drill", queueId: "by-correction:food:travel" }]);
  });

  test("unclaimed keys propagate to the review command path", () => {
    const state = openStatsOverlay(sections);
    const result = reduceStatsOverlay(state, key(":"));

    expect(result.overlay).toEqual({ kind: "stats", state });
    expect(result.effects).toEqual([]);
    expect(result.propagated).toBe(true);
  });
});
