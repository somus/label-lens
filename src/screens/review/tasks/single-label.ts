import { labelName } from "../../../config/config.ts";
import { Box } from "../../../render/box.ts";
import type { Segment } from "../../../render/chrome/status-bar.ts";
import { segmentsToStyledText } from "../../../render/chrome/status-bar.ts";
import { foldNamespace } from "../../../render/label-fold.ts";
import { SectionHeader } from "../../../render/section-header.ts";
import { Text, TextAttributes } from "../../../render/text.ts";
import type { DecisionRenderArgs, TaskKind, TaskRenderer } from "./types.ts";

const MAX_LABELS_PER_ROW = 5;

type Mode = "boundary" | "classification";

export function createSingleLabelTask(args: {
  mode: Mode;
  contextRowsBefore: number;
  contextRowsAfter: number;
}): TaskRenderer {
  return {
    id: args.mode satisfies TaskKind,
    contextRowsBefore: args.contextRowsBefore,
    contextRowsAfter: args.contextRowsAfter,
    contextIntensity: args.mode === "boundary" ? "strong" : "weak",
    renderDecision(rargs) {
      return renderDecisionChipRail(rargs);
    },
  };
}

/**
 * Horizontal label chip rail. Each chip is `[N] label` with the
 * predicted label prefixed by `▸` and an inline confidence percent.
 * Predicted is rendered bold + default tone; others are muted so the eye
 * lands on the recommendation first. Wraps to multi-row when there are
 * more than `MAX_LABELS_PER_ROW` labels.
 */
function renderDecisionChipRail(args: DecisionRenderArgs): ReturnType<typeof Box> {
  const { record, labels, display } = args;
  const predicted = record?.primaryPrediction?.label ?? null;
  const confidence = record?.primaryPrediction?.confidence ?? null;
  // Mono / 16-color: filled diamond falls back to `*` to match the
  // picker overlay's mono fallback. Same glyph appears in both
  // surfaces.
  const rich = display.color === "truecolor" || display.color === "256";
  const predictedGlyph = rich ? "◆" : "*";
  // Cap at 9 since digit keys 1-9 are the accelerator surface. Labels
  // beyond 9 are still reachable via the relabel picker (`r`).
  const visible = labels.slice(0, 9);
  const rows: Segment[][] = [];
  let current: Segment[] = [];
  let inRow = 0;
  for (let i = 0; i < visible.length; i++) {
    const entry = visible[i]!;
    const name = labelName(entry);
    const isPredicted = name === predicted;
    if (inRow === MAX_LABELS_PER_ROW) {
      rows.push(current);
      current = [];
      inRow = 0;
    }
    if (inRow > 0) current.push({ text: "   ", tone: "default" });
    current.push({ text: " ", tone: "default" });
    // `◆` marks the model's prediction; non-predicted rows reserve the
    // same column with a space so chips stay column-aligned. Matches
    // the picker overlay so both surfaces speak the same visual
    // language.
    current.push({
      text: isPredicted ? predictedGlyph : " ",
      tone: isPredicted ? "accent" : "default",
    });
    current.push({ text: " ", tone: "default" });
    current.push({
      text: `[${i + 1}]`,
      tone: isPredicted ? "accent" : "accentDeep",
    });
    current.push({ text: "  ", tone: "default" });
    for (const seg of foldNamespace(name, isPredicted ? "default" : "muted")) {
      current.push(seg);
    }
    if (isPredicted && confidence !== null) {
      const pct = Math.round(confidence * 100);
      current.push({ text: `  ${pct}%`, tone: "muted" });
    }
    inRow += 1;
  }
  if (current.length > 0) rows.push(current);

  return Box(
    { flexDirection: "column", marginTop: 1, flexShrink: 0 },
    SectionHeader({ display, label: "labels" }),
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
