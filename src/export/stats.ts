import { basename } from "node:path";
import type { Db } from "../store/db.ts";
import { progressCounts } from "../store/queries.ts";
import {
  acceptanceBySource,
  importedIssues,
  relabelBySource,
  type StatRow,
  suggestedNext,
  topCorrections,
} from "../store/stats.ts";

export function exportStatsMarkdown(db: Db, datasetPath: string, now: Date = new Date()): string {
  const out: string[] = [];
  out.push(`# LabelLens stats — ${basename(datasetPath)}`);
  out.push("");
  out.push(`Generated ${now.toISOString()}`);
  out.push("");
  renderProgress(db, out);
  renderBySource(db, out);
  renderTopCorrections(db, out);
  renderImportedIssues(db, out);
  renderSuggestedNext(db, out);
  return `${out.join("\n")}\n`;
}

function renderProgress(db: Db, out: string[]): void {
  const c = progressCounts(db);
  const reviewed = c.accepted + c.relabeled + c.rejected;
  out.push("## Progress");
  out.push("");
  out.push(`- **Reviewed**: ${reviewed} / ${c.total}`);
  out.push(`- **Skipped**: ${c.skipped}`);
  out.push(`- **Pending**: ${c.pending}`);
  out.push("");
}

function renderBySource(db: Db, out: string[]): void {
  const accept = bySource(acceptanceBySource(db), "acceptance-by-source");
  const relabel = bySource(relabelBySource(db), "relabel-by-source");
  const sources = new Set<string>([...accept.keys(), ...relabel.keys()]);
  if (sources.size === 0) return;
  out.push("## By source");
  out.push("");
  out.push("| Source | Acceptance rate | Relabel rate | Records reviewed |");
  out.push("| --- | --- | --- | --- |");
  for (const source of [...sources].sort()) {
    const a = accept.get(source);
    const r = relabel.get(source);
    const reviewed = a?.reviewed ?? r?.reviewed ?? 0;
    out.push(`| ${source} | ${formatRate(a?.rate)} | ${formatRate(r?.rate)} | ${reviewed} |`);
  }
  out.push("");
}

function bySource(
  rows: StatRow[],
  kind: "acceptance-by-source" | "relabel-by-source",
): Map<string, { rate: number; reviewed: number }> {
  const out = new Map<string, { rate: number; reviewed: number }>();
  for (const row of rows) {
    if (row.kind === kind) {
      out.set(row.source, { rate: row.rate, reviewed: row.reviewed });
    }
  }
  return out;
}

function formatRate(rate: number | undefined): string {
  if (rate === undefined) return "—";
  return `${(rate * 100).toFixed(0)}%`;
}

function renderTopCorrections(db: Db, out: string[]): void {
  const rows = topCorrections(db);
  if (rows.length === 0) return;
  out.push("## Top corrections");
  out.push("");
  out.push("| From | To | Count |");
  out.push("| --- | --- | --- |");
  for (const row of rows) {
    if (row.kind !== "top-correction") continue;
    out.push(`| ${row.from} | ${row.to} | ${row.count} |`);
  }
  out.push("");
}

function renderImportedIssues(db: Db, out: string[]): void {
  const rows = importedIssues(db);
  if (rows.length === 0) return;
  out.push("## Imported issues");
  out.push("");
  out.push("| Issue type | Count |");
  out.push("| --- | --- |");
  for (const row of rows) {
    if (row.kind !== "imported-issue") continue;
    out.push(`| ${row.issueType} | ${row.count} |`);
  }
  out.push("");
}

function renderSuggestedNext(db: Db, out: string[]): void {
  const rows = suggestedNext(db);
  out.push("## Suggested next queue");
  out.push("");
  const first = rows[0];
  if (first && first.kind === "suggested-next") {
    out.push(`\`${first.queueId}\``);
  } else {
    out.push("All caught up.");
  }
  out.push("");
}
