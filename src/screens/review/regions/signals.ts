import { BadgeLine, type BadgeVariant } from "../../../render/badge.ts";
import { Box } from "../../../render/box.ts";
import type { ResolvedDisplay } from "../../../render/capability.ts";
import { type Segment, segmentsToStyledText } from "../../../render/chrome/status-bar.ts";
import { issueGlyph } from "../../../render/glyph-map.ts";
import { foldNamespace } from "../../../render/label-fold.ts";
import { progressBar } from "../../../render/progress-bar.ts";
import { Text, TextAttributes } from "../../../render/text.ts";
import type { StoredIssue } from "../../../store/issues.ts";
import type { RecordWithPrimaryPrediction, StoredPrediction } from "../../../types.ts";

const CONF_BAR_WIDTH = 9;

export type SignalsArgs = {
  record: RecordWithPrimaryPrediction | null;
  /**
   * All predictions on the focused record. The primary is rendered as
   * the headline; the rest (if any) populate the alternatives strip.
   * `predictionsForRecord` keeps confidence-descending order so
   * `[0]` is always the primary.
   */
  predictions: StoredPrediction[];
  issues: StoredIssue[];
  display: ResolvedDisplay;
  /** Total dataset record count — duplicate-cluster badge needs it to
   *  derive an absolute group size from the issue score. */
  totalRecords: number;
  /** Current record's marked tag state — prefixes the headline with
   *  `⦿ marked` when true. */
  marked: boolean;
};

export function Signals(args: SignalsArgs): ReturnType<typeof Box> {
  const { record, predictions, issues, display, totalRecords, marked } = args;
  if (!record) return Box({});
  const primary = record.primaryPrediction;
  const rows: ReturnType<typeof Box | typeof Text>[] = [];

  if (primary) rows.push(headlineRow(primary, display, marked));
  if (issues.length > 0) {
    rows.push(Box({ height: 1 }), issueBadges(issues, totalRecords, predictions.length, display));
  }
  if (predictions.length > 1) rows.push(alternativesRow(predictions, display));
  if (record.note) rows.push(noteRow(record.note));

  if (rows.length === 0) return Box({});
  return Box({ flexDirection: "column", flexShrink: 0, marginTop: 1 }, ...rows);
}

function headlineRow(
  p: StoredPrediction,
  display: ResolvedDisplay,
  marked: boolean,
): ReturnType<typeof Text> {
  const labelSegs = foldNamespace(p.label, "bold");
  const segs: Segment[] = [{ text: " ", tone: "default" }];
  if (marked) {
    segs.push({ text: "⦿ marked", tone: "warning" });
    segs.push({ text: "  ", tone: "dim" });
  }
  segs.push({ text: "◇ ", tone: "accent" });
  for (const seg of labelSegs) segs.push(seg);
  if (p.confidence !== null) {
    const pct = Math.round(p.confidence * 100);
    const tone = confidenceTone(p.confidence);
    const bar = progressBar(pct, 100, CONF_BAR_WIDTH, display);
    segs.push({ text: "  ", tone: "dim" });
    segs.push({ text: bar, tone });
    segs.push({ text: ` ${pct}%`, tone });
  }
  segs.push({ text: "   ", tone: "dim" });
  segs.push({ text: "src ", tone: "muted" });
  for (const seg of foldNamespace(p.source, "muted")) segs.push(seg);
  if (p.reason) {
    segs.push({ text: "   ", tone: "dim" });
    segs.push({ text: p.reason, tone: "muted" });
  }
  return Text({
    content: segmentsToStyledText(segs, display),
    attributes: TextAttributes.BOLD,
    wrapMode: "word",
  });
}

function alternativesRow(
  predictions: StoredPrediction[],
  display: ResolvedDisplay,
): ReturnType<typeof Text> {
  const others = predictions.slice(1);
  const segs: Segment[] = [{ text: " also ", tone: "muted" }];
  others.forEach((p, i) => {
    if (i > 0) segs.push({ text: "   ·   ", tone: "dim" });
    for (const seg of foldNamespace(p.source, "muted")) segs.push(seg);
    segs.push({ text: " → ", tone: "dim" });
    for (const seg of foldNamespace(p.label, "default")) segs.push(seg);
    const conf = p.confidence !== null ? `${Math.round(p.confidence * 100)}%` : "—";
    segs.push({ text: ` (${conf})`, tone: "dim" });
  });
  return Text({
    content: segmentsToStyledText(segs, display),
    wrapMode: "word",
    attributes: TextAttributes.DIM,
  });
}

function issueBadges(
  issues: StoredIssue[],
  totalRecords: number,
  predictionCount: number,
  display: ResolvedDisplay,
): ReturnType<typeof Box> {
  const sorted = [...issues].sort((a, b) => a.type.localeCompare(b.type));
  return Box(
    { flexDirection: "column" },
    ...sorted.map((issue) =>
      BadgeLine({
        display,
        variant: badgeVariant(issue.type),
        icon: issueGlyph(issue.type, display),
        label: badgeCopy(issue, totalRecords, predictionCount),
      }),
    ),
  );
}

function noteRow(note: string): ReturnType<typeof Text> {
  const truncated = note.length > 200 ? `${note.slice(0, 200)}…` : note;
  const suffix = note.length > 200 ? " (press n for full)" : "";
  return Text({
    content: ` note: ${truncated}${suffix}`,
    attributes: TextAttributes.DIM,
  });
}

function confidenceTone(c: number | null): Segment["tone"] {
  if (c === null) return "muted";
  if (c >= 0.8) return "success";
  if (c >= 0.5) return "warning";
  return "danger";
}

function badgeVariant(issueType: StoredIssue["type"]): BadgeVariant {
  switch (issueType) {
    case "low_confidence":
      return "warning";
    case "source_disagreement":
      return "warning";
    case "exact_duplicate":
      return "info";
    default:
      return "neutral";
  }
}

function badgeCopy(issue: StoredIssue, totalRecords: number, predictionCount: number): string {
  const score = issue.score ?? 0;
  switch (issue.type) {
    case "low_confidence": {
      const confPct = Math.round((1 - score) * 100);
      return `Model is uncertain (confidence ${confPct}%)`;
    }
    case "source_disagreement": {
      const n = predictionCount;
      const agreed = Math.max(1, Math.round((1 - score) * n));
      const sourcesWord = n === 1 ? "source" : "sources";
      return `Sources disagree on this record (${agreed}/${n} ${sourcesWord} agreed)`;
    }
    case "exact_duplicate": {
      const groupSize = Math.max(2, Math.round(score * totalRecords));
      return `Identical text appears ${groupSize} times in this dataset`;
    }
    default:
      return `${issue.type}${score ? ` (${score.toFixed(2)})` : ""}`;
  }
}
