import type { FieldMap } from "./inference.ts";

export type LabelConfigEntry = string | { name: string; key?: string; color?: string };

export type DisplayConfig = {
  color?: "truecolor" | "256" | "16" | "mono" | "auto";
  banding?: "on" | "off" | "auto";
  theme?: "light" | "dark" | "auto";
  candidatePin?: number;
  layout?: "auto" | "stack" | "split";
  motion?: "auto" | "on" | "off";
};

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
    },
  };
}

export function labelName(entry: LabelConfigEntry): string {
  return typeof entry === "string" ? entry : entry.name;
}
