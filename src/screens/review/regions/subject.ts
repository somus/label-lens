import { BandedRecord } from "../../../render/banded-record.ts";
import { Box } from "../../../render/box.ts";
import type { ResolvedDisplay } from "../../../render/capability.ts";
import { segmentsToStyledText } from "../../../render/chrome/status-bar.ts";
import { EmptyState } from "../../../render/empty-state.ts";
import { type KindTintLevel, kindTintLevel, labelGlyph } from "../../../render/glyph-map.ts";
import { Text, TextAttributes } from "../../../render/text.ts";
import type { RecordWithPrimaryPrediction } from "../../../types.ts";

export type SubjectWindow = {
  records: RecordWithPrimaryPrediction[];
  focusedIndex: number;
  startIndex: number;
};

export type ContextStrip = { before: string[]; after: string[] };

export type BoundaryRowMeta = {
  display: ResolvedDisplay;
  glyphByLabel: Map<string, string | undefined>;
};

export type SubjectArgs = {
  window: SubjectWindow;
  display: ResolvedDisplay;
  /**
   * Boundary task — ±N lines of same-document context. When present, the
   * focused record's neighbourhood is the strip (rather than queue
   * siblings) and a dashed separator divides strip from focus.
   */
  contextStrip: ContextStrip | null;
  /**
   * Pin position to use for layout this render. Smaller than
   * `display.candidatePin` when there are fewer preceding records than
   * the pin reserves room for.
   */
  effectivePin: number;
  /** Boundary-task per-row meta (label → glyph + kind tint). Null for
   *  classification. */
  boundary: BoundaryRowMeta | null;
  /** Render mode hint sourced from the task renderer — `weak` makes
   *  queue siblings render as dim context (classification preview);
   *  `strong` keeps full band tints. */
  contextIntensity: "strong" | "weak";
};

export function Subject(args: SubjectArgs): ReturnType<typeof Box> {
  const { window, display, contextStrip, effectivePin, boundary, contextIntensity } = args;
  if (window.records.length === 0 || window.focusedIndex < 0) {
    const rich = display.color === "truecolor" || display.color === "256";
    return EmptyState({
      display,
      glyph: rich ? "✓" : "*",
      glyphTone: "success",
      message: "All records reviewed",
      hint: "[/] switch queue · [q] quit",
    });
  }

  const focused = window.records[window.focusedIndex]!;
  const focusedAbsolute = window.startIndex + window.focusedIndex;
  // Weak-intensity preview uses BandedRecord's `context` variant — same
  // dim attrs the boundary context strip already uses — so classification
  // siblings read as queue preview rather than semantic context.
  const previewVariant = contextIntensity === "weak" ? "context" : "queue";

  const beforeChildren = contextStrip
    ? [
        ...contextStrip.before.map((line, i) =>
          BandedRecord({
            text: line,
            isFocused: false,
            bandSlot: slotFor(i),
            display,
            variant: "context",
          }),
        ),
        contextSeparator(display),
      ]
    : window.records.slice(0, window.focusedIndex).map((r, i) => {
        const meta = boundaryMetaFor(r, boundary);
        return BandedRecord({
          text: r.text,
          isFocused: false,
          bandSlot: slotFor(window.startIndex + i),
          display,
          variant: previewVariant,
          confidence: r.primaryPrediction?.confidence ?? null,
          kindGlyph: meta?.kindGlyph,
          kindTintLevel: meta?.kindTintLevel,
        });
      });

  const afterChildren = contextStrip
    ? [
        contextSeparator(display),
        ...contextStrip.after.map((line, i) =>
          BandedRecord({
            text: line,
            isFocused: false,
            bandSlot: slotFor(i),
            display,
            variant: "context",
          }),
        ),
      ]
    : window.records.slice(window.focusedIndex + 1).map((r, i) => {
        const meta = boundaryMetaFor(r, boundary);
        return BandedRecord({
          text: r.text,
          isFocused: false,
          bandSlot: slotFor(focusedAbsolute + 1 + i),
          display,
          variant: previewVariant,
          confidence: r.primaryPrediction?.confidence ?? null,
          kindGlyph: meta?.kindGlyph,
          kindTintLevel: meta?.kindTintLevel,
        });
      });

  return Box(
    { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
    Box(
      {
        flexDirection: "column",
        flexBasis: 0,
        flexGrow: effectivePin,
        flexShrink: 0,
        justifyContent: "flex-end",
        overflow: "hidden",
      },
      ...beforeChildren,
    ),
    Box(
      {
        flexDirection: "column",
        flexBasis: 0,
        flexGrow: 1 - effectivePin,
        flexShrink: 1,
        overflow: "hidden",
      },
      (() => {
        const meta = boundaryMetaFor(focused, boundary);
        return BandedRecord({
          text: focused.text,
          isFocused: true,
          bandSlot: slotFor(focusedAbsolute),
          display,
          kindGlyph: meta?.kindGlyph,
          kindTintLevel: meta?.kindTintLevel,
        });
      })(),
      ...afterChildren,
    ),
  );
}

function slotFor(absoluteIndex: number): "even" | "odd" {
  return absoluteIndex % 2 === 0 ? "even" : "odd";
}

function boundaryMetaFor(
  record: RecordWithPrimaryPrediction,
  boundary: BoundaryRowMeta | null,
): { kindGlyph?: string; kindTintLevel?: KindTintLevel | null } | null {
  if (!boundary) return null;
  const label = record.primaryPrediction?.label;
  if (!label) return null;
  const configGlyph = boundary.glyphByLabel.get(label);
  return {
    kindGlyph: labelGlyph(label, configGlyph, boundary.display),
    kindTintLevel: kindTintLevel(label),
  };
}

function contextSeparator(display: ResolvedDisplay): ReturnType<typeof Text> {
  return Text({
    content: segmentsToStyledText([{ text: ` ${"─".repeat(60)}`, tone: "dim" }], display),
    attributes: TextAttributes.DIM,
  });
}
