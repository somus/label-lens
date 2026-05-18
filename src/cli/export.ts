import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type ExportFormat, parseExportArgument, performExport } from "../actions/export/run.ts";
import type { LabellensConfig } from "../config/config.ts";
import { ConfigLoadError, loadConfig } from "../config/load.ts";
import { openDb } from "../store/db.ts";

export type RunExportCliArgs = {
  args: string[];
  cwd: string;
};

/**
 * Thrown for user-facing CLI errors. Carries an exit code so `src/main.ts` can
 * print the message + exit, while tests can `.rejects.toThrow` without the
 * process actually terminating.
 */
export class ExportCliError extends Error {
  readonly code: number;
  constructor(message: string, code = 2) {
    super(message);
    this.code = code;
    this.name = "ExportCliError";
  }
}

export async function runExportCli({ args, cwd }: RunExportCliArgs): Promise<void> {
  const configPath = resolve(cwd, "labellens.config.json");
  if (!existsSync(configPath)) {
    throw new ExportCliError(
      `no labellens.config.json found in ${cwd}. Run 'labellens init <file.jsonl>' first.`,
    );
  }
  const stateDbPath = join(dirname(configPath), ".labellens", "state.db");
  if (!existsSync(stateDbPath)) {
    throw new ExportCliError(
      `no review state found at ${stateDbPath}. Run 'labellens' first to ingest.`,
    );
  }

  let config: LabellensConfig;
  try {
    config = await loadConfig(configPath);
  } catch (err) {
    if (err instanceof ConfigLoadError) {
      throw new ExportCliError([err.message, ...err.errors.map((e) => `  ${e}`)].join("\n"));
    }
    throw err;
  }
  const parsed = parseExportArgument(args);
  if (parsed.error) {
    throw new ExportCliError(`${parsed.error}\n\n${usageText()}`);
  }
  const format: ExportFormat = parsed.format ?? (config.output.format === "csv" ? "csv" : "jsonl");

  const db = openDb(stateDbPath);
  try {
    const result = performExport(db, config, {
      format,
      includeRejected: parsed.includeRejected,
      includeSkipped: parsed.includeSkipped,
      includeOrphans: parsed.includeOrphans,
      outputPath: parsed.outputPath,
    });
    console.log(`Exported ${result.format} to ${result.path}`);
  } finally {
    db.$client.close();
  }
}

export function usageText(): string {
  return `usage: labellens export [jsonl|csv|review-log|stats] [options]

Default format is config.output.format (jsonl if unset).
Default output base is config.output.path (siblings derived: .csv, .review-log.jsonl, .stats.md).

options:
  --include-rejected     include records with status='rejected' (emitted with label:null)
  --include-skipped      include records with status='skipped'  (emitted with label:null)
  --include-orphans      include records marked orphan by re-ingest (PRD §13)
  -o, --output <path>    override the output base path

examples:
  labellens export                                   # use config defaults
  labellens export csv                               # csv at sibling path
  labellens export jsonl --include-rejected
  labellens export stats -o ./reports/run-42.md

CSV multi-label arrays are joined by ';' (MVP).`;
}
