import { labelKey, labelName } from "../../../config/config.ts";
import { decodeLabelSet } from "../../../labels/label-set.ts";
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

function renderMultiLabelChipRail(args: DecisionRenderArgs): ReturnType<typeof Box> {
  const { record, labels, display, contentWidth } = args;
  if (!record) return Box({});
  const predictedSet = record.primaryPrediction
    ? new Set(decodeLabelSet(record.primaryPrediction.label))
    : new Set<string>();
  const confidence = record.primaryPrediction?.confidence ?? null;
  const rich = display.color === "truecolor" || display.color === "256";
  const predictedGlyph = rich ? "◆" : "*";
  const visible = labels.slice(0, 9);
  const rows: Segment[][] = [];
  let current: Segment[] = [];
  let inRow = 0;
  for (let i = 0; i < visible.length; i++) {
    const entry = visible[i]!;
    const name = labelName(entry);
    const isPredicted = predictedSet.has(name);
    if (inRow === MAX_LABELS_PER_ROW) {
      rows.push(current);
      current = [];
      inRow = 0;
    }
    if (inRow > 0) current.push({ text: "   ", tone: "default" });
    current.push({ text: " ", tone: "default" });
    current.push({
      text: isPredicted ? predictedGlyph : " ",
      tone: isPredicted ? "accent" : "default",
    });
    current.push({ text: " ", tone: "default" });
    current.push({
      text: labelChipText({ index: i, key: labelKey(entry), mode: display.labelChip }),
      tone: isPredicted ? "accent" : "accentDeep",
    });
    current.push({ text: "  ", tone: "default" });
    for (const seg of foldNamespace(name, isPredicted ? "default" : "muted")) {
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

  if (confidence !== null && rows.length > 0) {
    const pct = Math.round(confidence * 100);
    rows[rows.length - 1]!.push({ text: `   ${pct}%`, tone: "muted" });
  }

  return Box(
    { flexDirection: "column", marginTop: 1, flexShrink: 0 },
    SectionHeader({ display, label: "labels", width: contentWidth }),
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
