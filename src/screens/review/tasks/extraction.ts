import type { ExtractionField } from "../../../config/config.ts";
import { decodeExtractionObject } from "../../../labels/extraction-object.ts";
import { Box } from "../../../render/box.ts";
import type { Segment } from "../../../render/chrome/status-bar.ts";
import { segmentsToStyledText } from "../../../render/chrome/status-bar.ts";
import { SectionHeader } from "../../../render/section-header.ts";
import { Text, TextAttributes } from "../../../render/text.ts";
import type { DecisionRenderArgs, TaskKind, TaskRenderer } from "./types.ts";

export function createExtractionTask(args: {
  contextRowsBefore: number;
  contextRowsAfter: number;
  fields: ExtractionField[];
}): TaskRenderer {
  return {
    id: "extraction" satisfies TaskKind,
    contextRowsBefore: args.contextRowsBefore,
    contextRowsAfter: args.contextRowsAfter,
    contextIntensity: "weak",
    renderDecision(rargs) {
      return renderExtractionFieldRail({ ...rargs, fields: args.fields });
    },
  };
}

function renderExtractionFieldRail(
  args: DecisionRenderArgs & { fields: ExtractionField[] },
): ReturnType<typeof Box> {
  const { record, display, contentWidth, fields } = args;
  if (!record) return Box({});
  const predicted = record.primaryPrediction
    ? decodeExtractionObject(record.primaryPrediction.label, fields)
    : {};
  const confidence = record.primaryPrediction?.confidence ?? null;
  const rows = fields.map((f) => {
    const predVal = predicted[f.name] ?? null;
    return renderFieldRow(f, predVal);
  });

  const hintSegments: Segment[] = [
    { text: " ", tone: "default" },
    { text: "[a]", tone: "accent" },
    { text: " accept · ", tone: "muted" },
    { text: "[r]", tone: "accent" },
    { text: " edit · ", tone: "muted" },
    { text: "[x]", tone: "accent" },
    { text: " reject · ", tone: "muted" },
    { text: "[s]", tone: "accent" },
    { text: " skip", tone: "muted" },
  ];

  const confidenceRow =
    confidence !== null
      ? Text({
          content: segmentsToStyledText(
            [{ text: `   ${Math.round(confidence * 100)}%`, tone: "muted" }],
            display,
          ),
        })
      : null;

  return Box(
    { flexDirection: "column", marginTop: 1, flexShrink: 0 },
    SectionHeader({
      display,
      label: "fields",
      width: contentWidth,
    }),
    Text({ content: " " }),
    ...rows.map((segs) =>
      Text({
        content: segmentsToStyledText(segs, display),
        attributes: TextAttributes.BOLD,
        wrapMode: "word",
      }),
    ),
    ...(confidenceRow ? [confidenceRow] : []),
    Text({ content: " " }),
    Text({
      content: segmentsToStyledText(hintSegments, display),
      attributes: TextAttributes.DIM,
    }),
  );
}

function renderFieldRow(field: ExtractionField, predicted: string | null): Segment[] {
  const glyph: Segment = { text: "◆", tone: "accent" };
  const valueTone: Segment["tone"] = predicted === null && field.required ? "warning" : "default";
  const value = predicted === null ? (field.required ? "<required>" : "—") : predicted;
  return [
    { text: " ", tone: "default" },
    glyph,
    { text: "  ", tone: "default" },
    { text: field.name, tone: "muted" },
    { text: ": ", tone: "muted" },
    { text: value, tone: valueTone },
  ];
}
