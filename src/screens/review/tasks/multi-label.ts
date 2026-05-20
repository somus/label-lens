import { labelKey, labelName } from "../../../config/config.ts";
import { decodeLabelSet, labelSetsEqual } from "../../../labels/label-set.ts";
import { Box } from "../../../render/box.ts";
import type { Segment } from "../../../render/chrome/status-bar.ts";
import { segmentsToStyledText } from "../../../render/chrome/status-bar.ts";
import { labelChipText } from "../../../render/label-chip.ts";
import { foldNamespace } from "../../../render/label-fold.ts";
import { SectionHeader } from "../../../render/section-header.ts";
import { Text, TextAttributes } from "../../../render/text.ts";
import type { DecisionRenderArgs, TaskKind, TaskRenderer } from "./types.ts";

const MAX_LABELS_PER_ROW = 5;

export function createMultiLabelTask(args: {
  contextRowsBefore: number;
  contextRowsAfter: number;
}): TaskRenderer {
  return {
    id: "multi-label" satisfies TaskKind,
    contextRowsBefore: args.contextRowsBefore,
    contextRowsAfter: args.contextRowsAfter,
    contextIntensity: "weak",
    renderDecision(rargs) {
      return renderMultiLabelChipRail(rargs);
    },
  };
}

type DiffKind = "kept" | "added" | "removed" | "none";

function classify(name: string, predicted: Set<string>, draft: Set<string> | undefined): DiffKind {
  const inPred = predicted.has(name);
  if (!draft) return inPred ? "kept" : "none";
  const inDraft = draft.has(name);
  if (inPred && inDraft) return "kept";
  if (!inPred && inDraft) return "added";
  if (inPred && !inDraft) return "removed";
  return "none";
}

function diffGlyph(kind: DiffKind, draftActive: boolean): { text: string; tone: Segment["tone"] } {
  if (!draftActive) {
    return kind === "kept" ? { text: "◆", tone: "accent" } : { text: " ", tone: "default" };
  }
  switch (kind) {
    case "kept":
      return { text: "=", tone: "accent" };
    case "added":
      return { text: "+", tone: "success" };
    case "removed":
      return { text: "-", tone: "danger" };
    case "none":
      return { text: " ", tone: "default" };
  }
}

function richGlyph(
  g: { text: string; tone: Segment["tone"] },
  rich: boolean,
): {
  text: string;
  tone: Segment["tone"];
} {
  if (rich) return g;
  // Mono / 16-color: `◆` falls back to `*`; diff glyphs are ASCII already.
  if (g.text === "◆") return { text: "*", tone: g.tone };
  return g;
}

function renderMultiLabelChipRail(args: DecisionRenderArgs): ReturnType<typeof Box> {
  const { record, labels, display, contentWidth, multiLabelDraft } = args;
  if (!record) return Box({});
  const predictedSet = record.primaryPrediction
    ? new Set(decodeLabelSet(record.primaryPrediction.label))
    : new Set<string>();
  const confidence = record.primaryPrediction?.confidence ?? null;
  const rich = display.color === "truecolor" || display.color === "256";
  const draftActive = multiLabelDraft !== undefined;
  const visible = labels.slice(0, 9);
  const rows: Segment[][] = [];
  let current: Segment[] = [];
  let inRow = 0;
  for (let i = 0; i < visible.length; i++) {
    const entry = visible[i]!;
    const name = labelName(entry);
    const kind = classify(name, predictedSet, multiLabelDraft);
    if (inRow === MAX_LABELS_PER_ROW) {
      rows.push(current);
      current = [];
      inRow = 0;
    }
    if (inRow > 0) current.push({ text: "   ", tone: "default" });
    current.push({ text: " ", tone: "default" });
    const glyph = richGlyph(diffGlyph(kind, draftActive), rich);
    current.push({ text: glyph.text, tone: glyph.tone });
    current.push({ text: " ", tone: "default" });
    const chipTone: Segment["tone"] = kind === "kept" || kind === "added" ? "accent" : "accentDeep";
    current.push({
      text: labelChipText({ index: i, key: labelKey(entry), mode: display.labelChip }),
      tone: chipTone,
    });
    current.push({ text: "  ", tone: "default" });
    const nameTone: Segment["tone"] = kind === "kept" || kind === "added" ? "default" : "muted";
    for (const seg of foldNamespace(name, nameTone)) {
      current.push(seg);
    }
    inRow += 1;
  }
  if (current.length > 0) rows.push(current);

  const hiddenCount = labels.length - visible.length;
  if (hiddenCount > 0) {
    const hiddenHasKey = labels.slice(visible.length).some((e) => labelKey(e) !== null);
    const hint: Segment[] = [
      { text: "   ", tone: "default" },
      { text: `+${hiddenCount} more`, tone: "muted" },
      { text: "  ", tone: "dim" },
      { text: "[r]", tone: "accent" },
      {
        text: hiddenHasKey ? " toggle all labels (some bind shortcuts)" : " toggle all labels",
        tone: "muted",
      },
    ];
    const lastRow = rows[rows.length - 1];
    if (lastRow) lastRow.push(...hint);
    else rows.push(hint);
  }

  // Confidence stays inline on the chip rail when no draft is active so
  // reviewers reading the rail at rest still see signal strength. Commit-
  // intent status moves to the section header's right slot when a draft
  // is active.
  if (!draftActive && confidence !== null && rows.length > 0) {
    const pct = Math.round(confidence * 100);
    rows[rows.length - 1]!.push({ text: `   ${pct}%`, tone: "muted" });
  }
  const headerTrailing = draftActive
    ? commitIntentSegments(predictedSet, multiLabelDraft!)
    : undefined;

  return Box(
    { flexDirection: "column", marginTop: 1, flexShrink: 0 },
    SectionHeader({
      display,
      label: "labels",
      width: contentWidth,
      ...(headerTrailing && headerTrailing.length > 0 ? { trailing: headerTrailing } : {}),
    }),
    Text({ content: " " }),
    ...rows.map((segs, idx) =>
      Text({
        content: segmentsToStyledText(segs, display),
        attributes: idx === 0 ? TextAttributes.BOLD : TextAttributes.NONE,
        wrapMode: "word",
      }),
    ),
  );
}

function commitIntentSegments(predicted: Set<string>, draft: Set<string>): Segment[] {
  const draftArr = [...draft];
  const predArr = [...predicted];
  if (draftArr.length === 0) {
    return [
      { text: "empty — Enter refused", tone: "warning" },
      { text: "  ", tone: "default" },
      { text: "[x]", tone: "accent" },
      { text: " reject", tone: "muted" },
    ];
  }
  if (labelSetsEqual(draftArr, predArr)) {
    return [
      { text: "accept", tone: "success" },
      { text: "  ", tone: "default" },
      { text: "[enter]", tone: "accent" },
    ];
  }
  let added = 0;
  let removed = 0;
  for (const d of draftArr) if (!predicted.has(d)) added++;
  for (const p of predArr) if (!draft.has(p)) removed++;
  return [
    { text: `relabel (-${removed} +${added})`, tone: "accent" },
    { text: "  ", tone: "default" },
    { text: "[enter]", tone: "accent" },
  ];
}
