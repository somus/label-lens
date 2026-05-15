import type { FieldMap } from "./inference.ts";

/**
 * `glyph` is parsed but not yet consumed by a renderer. Reserved for the
 * boundary-task label rendering work that will overlay per-label glyphs on
 * the kind defaults from `glyph-map.ts`. Until that ships, set values
 * survive a round-trip through config but have no visual effect.
 */
export type LabelConfigEntry =
  | string
  | { name: string; key?: string; color?: string; glyph?: string };

export type DisplayConfig = {
  color?: "truecolor" | "256" | "16" | "mono" | "auto";
  banding?: "on" | "off" | "auto";
  theme?: "light" | "dark" | "auto";
  candidatePin?: number;
  layout?: "auto" | "stack" | "split";
  motion?: "auto" | "on" | "off";
  sidebar?: "auto" | "on" | "off";
};

/**
 * Navigation-mode toggles. Defaults are conservative — every flag is off
 * unless the reviewer opts in via `labellens.config.json`.
 *
 * - `smartNext`: when true and the focused queue is `pending`, `j` / `k`
 *   advance through a sibling `smart-pending` cursor whose ordering is
 *   weighted by signal strength (low confidence + disagreement + flagged)
 *   instead of document order. The status bar surfaces `▸ smart` while the
 *   mode is active. `shift+j` / `shift+k` always navigate document order
 *   regardless of mode (PRD §14.7).
 */
export type NavigationConfig = {
  smartNext?: boolean;
};

export type BoundaryConfig = {
  documentField: string;
  contextLines: number;
};

export type LabellensConfig = {
  task: "classification" | "boundary";
  labels: LabelConfigEntry[];
  guidelines?: string;
  boundary?: BoundaryConfig;
  input: {
    path: string;
    format: "jsonl";
    fields: FieldMap;
  };
  output: {
    path: string;
    format: "jsonl" | "csv";
  };
  display?: DisplayConfig;
  navigation?: NavigationConfig;
};

export function defaultConfig(args: {
  inputPath: string;
  fields: FieldMap;
  labels?: string[];
  outputPath?: string;
  task?: "classification" | "boundary";
}): LabellensConfig {
  const labels = args.labels && args.labels.length > 0 ? [...args.labels] : ["other"];
  const task = args.task ?? "classification";
  return {
    task,
    labels,
    ...(task === "boundary" ? { boundary: { documentField: "document_id", contextLines: 3 } } : {}),
    input: {
      path: args.inputPath,
      format: "jsonl",
      fields: args.fields,
    },
    output: {
      path: args.outputPath ?? "./reviewed.jsonl",
      format: "jsonl",
    },
    display: {
      color: "auto",
      banding: "auto",
      theme: "auto",
      candidatePin: 0.4,
      layout: "auto",
      motion: "auto",
      sidebar: "auto",
    },
    navigation: {
      smartNext: false,
    },
  };
}

export function labelName(entry: LabelConfigEntry): string {
  return typeof entry === "string" ? entry : entry.name;
}
