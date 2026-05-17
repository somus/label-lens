import { BadgeLine, type BadgeVariant } from "../../../render/badge.ts";
import { Box } from "../../../render/box.ts";
import type { ResolvedDisplay } from "../../../render/capability.ts";
import { type Segment, segmentsToStyledText } from "../../../render/chrome/status-bar.ts";
import { issueGlyph } from "../../../render/glyph-map.ts";
import { foldNamespace } from "../../../render/label-fold.ts";
import { progressBar } from "../../../render/progress-bar.ts";
import { SectionHeader } from "../../../render/section-header.ts";
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
  /** Width budget for the section header rule. Computed once in the
   *  screen orchestrator so every region's header lines up at the
   *  same column. */
  contentWidth: number;
};

export function Signals(args: SignalsArgs): ReturnType<typeof Box> {
  const { record, predictions, issues, display, totalRecords, marked, contentWidth } = args;
  if (!record) return Box({});
  const primary = record.primaryPrediction;
  const rows: ReturnType<typeof Box | typeof Text>[] = [];

  if (primary) rows.push(...predictionStatRows(primary, predictions, display, marked));
  if (issues.length > 0) {
    rows.push(Box({ height: 1 }), issueBadges(issues, totalRecords, predictions.length, display));
  }
  if (record.note) rows.push(noteRow(record.note));

  if (rows.length === 0) return Box({});
  return Box(
    { flexDirection: "column", flexShrink: 0, marginTop: 1 },
    SectionHeader({ display, label: "prediction", width: contentWidth }),
    Text({ content: " " }),
    ...rows,
  );
}

/**
 * Stat-block render of a prediction. Each field renders as a labeled
 * key-value row:
 *
 *   label        ◇ utility            (marked tag prefix when set)
 *   confidence   ████████░░ 67%
 *   source       [llm:gpt-4]          (chip-bracketed for visual lift)
 *   reason       monthly subscription (only when set)
 *   agreement    2 / 3 sources agree  (only when multi-prediction)
 */
function predictionStatRows(
  primary: StoredPrediction,
  predictions: StoredPrediction[],
  display: ResolvedDisplay,
  marked: boolean,
): ReturnType<typeof Text>[] {
  const out: ReturnType<typeof Text>[] = [];

  // label row
  const labelSegs: Segment[] = [{ text: "◇ ", tone: "accent" }];
  for (const seg of foldNamespace(primary.label, "bold")) labelSegs.push(seg);
  if (marked) {
    labelSegs.push({ text: "   ", tone: "dim" });
    labelSegs.push({ text: "⦿ marked", tone: "warning" });
  }
  out.push(statRow(display, "label", labelSegs, TextAttributes.BOLD));

  // confidence row
  if (primary.confidence !== null) {
    const pct = Math.round(primary.confidence * 100);
    const tone = confidenceTone(primary.confidence);
    const bar = progressBar(pct, 100, CONF_BAR_WIDTH, display);
    out.push(
      statRow(display, "confidence", [
        { text: bar, tone },
        { text: `  ${pct}%`, tone },
      ]),
    );
  }

  // source chip
  const sourceSegs: Segment[] = [
    { text: "[", tone: "dim" },
    ...foldNamespace(primary.source, "muted"),
    { text: "]", tone: "dim" },
  ];
  out.push(statRow(display, "source", sourceSegs));

  if (primary.reason) {
    out.push(statRow(display, "reason", [{ text: primary.reason, tone: "muted" }]));
  }

  // agreement (only when there are alternative predictions to compare).
  if (predictions.length > 1) {
    out.push(statRow(display, "agreement", agreementSegs(primary, predictions)));
  }

  return out;
}

const STAT_LABEL_WIDTH = 12;

/** One stat-row: `  <label-padded> <value-segments>`. */
function statRow(
  display: ResolvedDisplay,
  label: string,
  valueSegs: Segment[],
  textAttrs: number = TextAttributes.NONE,
): ReturnType<typeof Text> {
  const padded = ` ${label}`.padEnd(STAT_LABEL_WIDTH, " ");
  return Text({
    content: segmentsToStyledText([{ text: padded, tone: "muted" }, ...valueSegs], display),
    attributes: textAttrs,
    wrapMode: "word",
  });
}

/**
 * Build the `agreement` row's value segments. Counts predictions whose
 * label matches the primary; emits `unanimous (n / n)` when all agree,
 * `<agreed> / <n> sources agree` otherwise.
 */
function agreementSegs(primary: StoredPrediction, predictions: StoredPrediction[]): Segment[] {
  const n = predictions.length;
  const agreed = predictions.filter((p) => p.label === primary.label).length;
  if (agreed === n) {
    return [
      { text: "unanimous ", tone: "success" },
      { text: `(${agreed} / ${n})`, tone: "dim" },
    ];
  }
  return [
    { text: `${agreed} / ${n}`, tone: "warning" },
    { text: "  sources agree", tone: "muted" },
  ];
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
