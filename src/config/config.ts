import type { FieldMap } from "./inference.ts";

export type LabelConfigEntry = string | { name: string; key?: string; color?: string };

export type LabellensConfig = {
  task: "classification" | "boundary";
  labels: LabelConfigEntry[];
  guidelines?: string;
  input: {
    path: string;
    format: "jsonl";
    fields: FieldMap;
  };
  output: {
    path: string;
    format: "jsonl" | "csv";
  };
};

export function defaultConfig(args: {
  inputPath: string;
  fields: FieldMap;
  outputPath?: string;
}): LabellensConfig {
  return {
    task: "classification",
    labels: ["other"],
    input: {
      path: args.inputPath,
      format: "jsonl",
      fields: args.fields,
    },
    output: {
      path: args.outputPath ?? "./reviewed.jsonl",
      format: "jsonl",
    },
  };
}

export function labelName(entry: LabelConfigEntry): string {
  return typeof entry === "string" ? entry : entry.name;
}
