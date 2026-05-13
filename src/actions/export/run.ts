import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AppContext } from "../../app/context.ts";
import type { LabellensConfig } from "../../config/config.ts";
import { exportCsvString } from "../../export/csv.ts";
import { exportJsonlString } from "../../export/jsonl.ts";
import { exportReviewLogString } from "../../export/log.ts";
import { deriveExportPaths } from "../../export/paths.ts";
import { exportStatsMarkdown } from "../../export/stats.ts";
import type { Db } from "../../store/db.ts";
import type { QueueQuery } from "../../store/queries.ts";
import { type QueueId, resolveQueue } from "../../store/queues/registry.ts";
import type { Command } from "../command.ts";

export type ExportFormat = "jsonl" | "csv" | "review-log" | "stats";

export type RunExportOptions = {
  format: ExportFormat;
  includeRejected?: boolean;
  includeOrphans?: boolean;
  queueId?: QueueId | null;
  outputPath?: string;
};

export type RunExportResult = {
  path: string;
  format: ExportFormat;
};

export function performExport(
  db: Db,
  config: LabellensConfig,
  opts: RunExportOptions,
): RunExportResult {
  const basePath = opts.outputPath ?? config.output.path;
  const paths = deriveExportPaths(basePath);
  const queryForScope = scopeQuery(opts.queueId ?? null);
  let body: string;
  let path: string;
  switch (opts.format) {
    case "jsonl":
      body = exportJsonlString(db, {
        query: queryForScope,
        includeRejected: opts.includeRejected,
        includeOrphans: opts.includeOrphans,
      });
      path = paths.jsonl;
      break;
    case "csv":
      body = exportCsvString(db, {
        query: queryForScope,
        includeRejected: opts.includeRejected,
        includeOrphans: opts.includeOrphans,
      });
      path = paths.csv;
      break;
    case "review-log":
      body = exportReviewLogString(db);
      path = paths.reviewLog;
      break;
    case "stats":
      body = exportStatsMarkdown(db, config.input.path);
      path = paths.stats;
      break;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, "utf8");
  return { path, format: opts.format };
}

export function runExport(app: AppContext, opts: RunExportOptions): RunExportResult {
  return performExport(app.db, app.config, {
    ...opts,
    queueId: opts.queueId ?? app.queueId,
  });
}

function scopeQuery(queueId: QueueId | null | undefined): QueueQuery | undefined {
  if (!queueId) return undefined;
  return resolveQueue(queueId).query;
}

export function parseExportArgument(argument: string | undefined): {
  format?: ExportFormat;
  includeRejected: boolean;
  includeOrphans: boolean;
  outputPath?: string;
  error?: string;
} {
  const tokens = (argument ?? "").trim().split(/\s+/).filter(Boolean);
  let format: ExportFormat | undefined;
  let includeRejected = false;
  let includeOrphans = false;
  let outputPath: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === "--include-rejected") includeRejected = true;
    else if (t === "--include-orphans") includeOrphans = true;
    else if (t === "-o" || t === "--output") {
      outputPath = tokens[++i];
    } else if (!t.startsWith("--") && format === undefined) {
      if (!isFormat(t)) return { includeRejected, includeOrphans, error: `unknown format: ${t}` };
      format = t;
    } else {
      return { includeRejected, includeOrphans, error: `unknown argument: ${t}` };
    }
  }
  return { format, includeRejected, includeOrphans, outputPath };
}

function isFormat(s: string): s is ExportFormat {
  return s === "jsonl" || s === "csv" || s === "review-log" || s === "stats";
}

export const exportCommand: Command = {
  name: "export.run",
  scope: "global",
  binding: "e",
  run: (ctx) => {
    const format = ctx.config.output.format === "csv" ? "csv" : "jsonl";
    try {
      const result = runExport(ctx, { format });
      ctx.setFlash(`Exported to ${result.path}`, "info", 4000);
    } catch (err) {
      ctx.setFlash(`Export failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  },
};

export const paletteExportCommand: Command = {
  name: "palette.export",
  scope: "global",
  palette: ":export",
  run: (ctx, argument) => {
    const parsed = parseExportArgument(argument);
    if (parsed.error) {
      ctx.setFlash(`:export ${parsed.error}`, "error", 5000);
      return;
    }
    const format: ExportFormat =
      parsed.format ?? (ctx.config.output.format === "csv" ? "csv" : "jsonl");
    try {
      const result = runExport(ctx, {
        format,
        includeRejected: parsed.includeRejected,
        includeOrphans: parsed.includeOrphans,
        outputPath: parsed.outputPath,
      });
      ctx.setFlash(`Exported to ${result.path}`, "info", 4000);
    } catch (err) {
      ctx.setFlash(`Export failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  },
};
