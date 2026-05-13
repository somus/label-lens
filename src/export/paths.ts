export type ExportPaths = {
  jsonl: string;
  csv: string;
  reviewLog: string;
  stats: string;
};

export function deriveExportPaths(outputPath: string): ExportPaths {
  const stem = stripJsonlExt(outputPath);
  return {
    jsonl: `${stem}.jsonl`,
    csv: `${stem}.csv`,
    reviewLog: `${stem}.review-log.jsonl`,
    stats: `${stem}.stats.md`,
  };
}

function stripJsonlExt(p: string): string {
  if (p.endsWith(".jsonl")) return p.slice(0, -".jsonl".length);
  if (p.endsWith(".json")) return p.slice(0, -".json".length);
  if (p.endsWith(".csv")) return p.slice(0, -".csv".length);
  return p;
}
