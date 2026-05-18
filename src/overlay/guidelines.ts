import { readFileSync } from "node:fs";
import type { LabellensConfig } from "../config/config.ts";
import type { Overlay, OverlayEvent, ReduceResult } from "./types.ts";

export const GUIDELINES_PAGE = 10;

export type GuidelinesState = {
  source: "config" | "missing";
  content: string;
  scroll: number;
  title: string;
};

const PLACEHOLDER = "No guidelines configured. Set `guidelines` in labellens.config.json.";

export function openGuidelines(config: LabellensConfig): GuidelinesState {
  const raw = config.guidelines;
  if (raw === undefined || raw === "") {
    return { source: "missing", content: PLACEHOLDER, scroll: 0, title: "guidelines" };
  }
  if (raw.startsWith("#") || raw.includes("\n")) {
    return { source: "config", content: raw, scroll: 0, title: "guidelines" };
  }
  try {
    const content = readFileSync(raw, "utf8");
    return { source: "config", content, scroll: 0, title: "guidelines" };
  } catch {
    return {
      source: "missing",
      content: `could not read guidelines from ${raw}. Check the path in your config.`,
      scroll: 0,
      title: "guidelines",
    };
  }
}

export function openManPage(args: { topic: string; content: string }): GuidelinesState {
  return {
    source: "config",
    content: args.content,
    scroll: 0,
    title: `help: ${args.topic}`,
  };
}

function packed(state: GuidelinesState): Overlay {
  return { kind: "guidelines", state };
}

export function reduceGuidelines(state: GuidelinesState, event: OverlayEvent): ReduceResult {
  if (event.kind === "cancel") return { overlay: null, effects: [{ kind: "close" }] };
  if (event.kind === "commit") return { overlay: null, effects: [{ kind: "close" }] };
  if (event.kind !== "key") return { overlay: packed(state), effects: [] };
  const name = event.event.name;
  if (name === "escape") return { overlay: null, effects: [{ kind: "close" }] };
  if (name === "down") return scrolled(state, 1);
  if (name === "up") return scrolled(state, -1);
  if (name === "pagedown") return scrolled(state, GUIDELINES_PAGE);
  if (name === "pageup") return scrolled(state, -GUIDELINES_PAGE);
  return { overlay: packed(state), effects: [], propagated: true };
}

function scrolled(state: GuidelinesState, delta: number): ReduceResult {
  return {
    overlay: packed({ ...state, scroll: Math.max(state.scroll + delta, 0) }),
    effects: [],
  };
}
