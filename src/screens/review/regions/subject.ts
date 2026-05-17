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
  /** Boundary-task per-row meta (label → glyph + kind tint). Null for
   *  classification. */
  boundary: BoundaryRowMeta | null;
  /** Render mode hint sourced from the task renderer — `weak` makes
   *  queue siblings render as dim context (classification preview);
   *  `strong` keeps full band tints. */
  contextIntensity: "strong" | "weak";
  /**
   * How many neighbour rows the task wants above and below the focused
   * record. When the cursor is near the start/end of the queue and we
   * have fewer than `slotsBefore` / `slotsAfter` real neighbours, the
   * shortfall is padded with blank rows so the focus box stays in the
   * same screen position when scrolling.
   */
  slotsBefore: number;
  slotsAfter: number;
  /** Width budget for the focused row's bg so it caps at the same
   *  column as every other content row, instead of stretching to fill
   *  the entire main-column flex container. */
  contentWidth: number;
};

export function Subject(args: SubjectArgs): ReturnType<typeof Box> {
  const {
    window,
    display,
    contextStrip,
    boundary,
    contextIntensity,
    slotsBefore,
    slotsAfter,
    contentWidth,
  } = args;
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

  // Padding when the cursor is near the start of the queue (and we have
  // fewer real preceding records than the task wants). Renders as blank
  // rows so the focus box keeps its screen position as the reviewer
  // scrolls — no section-shift on first/last record.
  const realBefore = contextStrip ? contextStrip.before.length : window.focusedIndex;
  const realAfter = contextStrip
    ? contextStrip.after.length
    : window.records.length - window.focusedIndex - 1;
  const padBefore = Math.max(0, slotsBefore - realBefore);
  const padAfter = Math.max(0, slotsAfter - realAfter);

  const beforeChildren: ReturnType<typeof BandedRecord | typeof Text>[] = [
    ...blankRows(padBefore),
    ...(contextStrip
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
        })),
  ];

  const afterChildren: ReturnType<typeof BandedRecord | typeof Text>[] = [
    ...(contextStrip
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
        })),
    ...blankRows(padAfter),
  ];

  // Cluster-at-top layout: subject is auto-sized to its children's combined
  // height. The parent body adds a flexGrow spacer below the work cluster
  // so any leftover vertical space falls beneath the cluster rather than
  // gathering between subject and decision. Slot padding (`blankRows`
  // above and below) keeps the focus box at the same screen position
  // when scrolling through the queue.
  // Focused row is wrapped in a `width: contentWidth` Box so its bg /
  // focus border stop at the same column as every section header.
  // Without the cap the focused row stretched the full main-column
  // width while headers stopped early — visually misaligned.
  return Box(
    { flexDirection: "column", flexShrink: 0, overflow: "hidden" },
    ...beforeChildren,
    Box(
      { width: contentWidth, flexShrink: 0 },
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
    ),
    ...afterChildren,
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

function blankRows(n: number): ReturnType<typeof Text>[] {
  const out: ReturnType<typeof Text>[] = [];
  for (let i = 0; i < n; i++) out.push(Text({ content: " " }));
  return out;
}

function contextSeparator(display: ResolvedDisplay): ReturnType<typeof Text> {
  return Text({
    content: segmentsToStyledText([{ text: ` ${"─".repeat(60)}`, tone: "dim" }], display),
    attributes: TextAttributes.DIM,
  });
}
