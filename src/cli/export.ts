import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type ExportFormat, parseExportArgument, performExport } from "../actions/export/run.ts";
import type { LabellensConfig } from "../config/config.ts";
import { openDb } from "../store/db.ts";

export type RunExportCliArgs = {
  args: string[];
  cwd: string;
};

export async function runExportCli({ args, cwd }: RunExportCliArgs): Promise<void> {
  const configPath = resolve(cwd, "labellens.config.json");
  if (!existsSync(configPath)) {
    console.error(
      `labellens export: no labellens.config.json found in ${cwd}. Run 'labellens init <file.jsonl>' first.`,
    );
    process.exit(2);
  }
  const config = JSON.parse(await Bun.file(configPath).text()) as LabellensConfig;
  const stateDbPath = join(dirname(configPath), ".labellens", "state.db");
  if (!existsSync(stateDbPath)) {
    console.error(
      `labellens export: no review state found at ${stateDbPath}. Run 'labellens' first to ingest.`,
    );
    process.exit(2);
  }

  const parsed = parseExportArgument(args.join(" "));
  if (parsed.error) {
    console.error(`labellens export: ${parsed.error}`);
    printUsage();
    process.exit(2);
  }
  const format: ExportFormat = parsed.format ?? (config.output.format === "csv" ? "csv" : "jsonl");

  const db = openDb(stateDbPath);
  try {
    const result = performExport(db, config, {
      format,
      includeRejected: parsed.includeRejected,
      includeOrphans: parsed.includeOrphans,
      outputPath: parsed.outputPath,
    });
    console.log(`Exported ${result.format} to ${result.path}`);
  } finally {
    db.$client.close();
  }
}

function printUsage(): void {
  console.error(`usage: labellens export [jsonl|csv|review-log|stats] [options]

options:
  --include-rejected   emit rejected records with label:null
  --include-orphans    include orphan records (default: excluded)
  -o, --output <path>  override the output base path

CSV multi-label arrays are joined by ';' (MVP).`);
}
