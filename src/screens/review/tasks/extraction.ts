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
  const { record, display, contentWidth, extractionDraft, fields } = args;
  if (!record) return Box({});
  const predicted = record.primaryPrediction
    ? decodeExtractionObject(record.primaryPrediction.label, fields)
    : {};
  const confidence = record.primaryPrediction?.confidence ?? null;
  const draftActive = extractionDraft !== undefined;
  const rows = fields.map((f) => {
    const predVal = predicted[f.name] ?? null;
    const draftVal = draftActive ? (extractionDraft![f.name] ?? null) : predVal;
    return renderFieldRow(f, predVal, draftVal, draftActive);
  });

  const headerTrailing = draftActive
    ? commitIntentSegments(predicted, extractionDraft!, fields)
    : undefined;

  const hintSegments: Segment[] = [
    { text: " ", tone: "default" },
    { text: "[j/k]", tone: "accent" },
    { text: " focus · ", tone: "muted" },
    { text: "[enter]", tone: "accent" },
    { text: " edit / commit · ", tone: "muted" },
    { text: "[r]", tone: "accent" },
    { text: " form", tone: "muted" },
  ];

  const confidenceRow =
    !draftActive && confidence !== null
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
      ...(headerTrailing && headerTrailing.length > 0 ? { trailing: headerTrailing } : {}),
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

function renderFieldRow(
  field: ExtractionField,
  predicted: string | null,
  draft: string | null,
  draftActive: boolean,
): Segment[] {
  const glyph = draftActive ? draftGlyph(predicted, draft) : { text: "◆", tone: "accent" as const };
  const valueTone: Segment["tone"] =
    draft === null && field.required ? "warning" : draftActive ? "accent" : "default";
  const value = draft === null ? (field.required ? "<required>" : "—") : draft;
  return [
    { text: " ", tone: "default" },
    glyph,
    { text: "  ", tone: "default" },
    { text: field.name, tone: "muted" },
    { text: ": ", tone: "muted" },
    { text: value, tone: valueTone },
  ];
}

function draftGlyph(predicted: string | null, draft: string | null): Segment {
  if ((predicted ?? null) === (draft ?? null)) return { text: "=", tone: "accent" };
  if (predicted === null && draft !== null) return { text: "+", tone: "success" };
  if (predicted !== null && draft === null) return { text: "-", tone: "danger" };
  return { text: "~", tone: "warning" };
}

function commitIntentSegments(
  predicted: Record<string, string | null>,
  draft: Record<string, string | null>,
  fields: ExtractionField[],
): Segment[] {
  let missing = 0;
  let changed = 0;
  for (const f of fields) {
    const p = predicted[f.name] ?? null;
    const d = draft[f.name] ?? null;
    if (f.required && (d === null || d === "")) missing++;
    if (p !== d) changed++;
  }
  if (missing > 0) {
    return [
      { text: `missing ${missing} required`, tone: "warning" },
      { text: "  ", tone: "default" },
      { text: "[x]", tone: "accent" },
      { text: " reject", tone: "muted" },
    ];
  }
  if (changed === 0) {
    return [
      { text: "accept", tone: "success" },
      { text: "  ", tone: "default" },
      { text: "[enter]", tone: "accent" },
    ];
  }
  return [
    { text: `relabel (${changed} changed)`, tone: "accent" },
    { text: "  ", tone: "default" },
    { text: "[enter]", tone: "accent" },
  ];
}
