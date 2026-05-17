import { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { Text, TextAttributes } from "../text.ts";
import { type Segment, segmentsToStyledText } from "./status-bar.ts";

/**
 * Read-only ambient rail showing upcoming records in the current queue.
 * Visible at very wide terminals (≥200 cols, see `pickQueuePreview`) on
 * the left side of the main column. Cursor's neighbours render with a
 * dim tone; the focused row carries `▸` + accent.
 *
 * Width is fixed (28ch). Each row: `<id> <label> <conf>`.
 */
export function QueuePreview(props: {
  display: ResolvedDisplay;
  width: number;
  rows: QueuePreviewRow[];
  focusedIndex: number;
}): ReturnType<typeof Box> {
  const { display, width, rows, focusedIndex } = props;
  const innerWidth = Math.max(20, width - 2);
  const children: ReturnType<typeof Box | typeof Text>[] = [
    headerRow(display, innerWidth),
    Text({ content: "" }),
  ];
  rows.forEach((row, i) => {
    children.push(previewRow(display, row, innerWidth, i === focusedIndex));
  });
  if (rows.length === 0) {
    children.push(
      Text({
        content: " (queue is empty)",
        attributes: TextAttributes.DIM,
      }),
    );
  }
  return Box(
    {
      flexDirection: "column",
      width,
      flexShrink: 0,
      paddingLeft: 1,
      paddingRight: 1,
    },
    ...children,
  );
}

export type QueuePreviewRow = {
  id: string;
  label: string | null;
  confidence: number | null;
};

function headerRow(display: ResolvedDisplay, innerWidth: number): ReturnType<typeof Box> {
  const label = "Next up ";
  const ruleLen = Math.max(1, innerWidth - label.length);
  return Box(
    { flexDirection: "row", width: innerWidth, flexShrink: 0, overflow: "hidden" },
    Text({
      content: segmentsToStyledText(
        [
          { text: label, tone: "muted" },
          { text: "─".repeat(ruleLen), tone: "dim" },
        ],
        display,
      ),
      attributes: TextAttributes.BOLD,
      wrapMode: "char",
    }),
  );
}

function previewRow(
  display: ResolvedDisplay,
  row: QueuePreviewRow,
  innerWidth: number,
  focused: boolean,
): ReturnType<typeof Box> {
  const idText = shortId(row.id);
  const labelText = row.label ?? "—";
  const confText = row.confidence !== null ? `${Math.round(row.confidence * 100)}%` : "";
  const marker = focused ? "▸ " : "  ";
  const fixedCells = marker.length + idText.length + 1; // 1ch gap
  const confCells = confText.length + (confText ? 1 : 0); // pad before conf
  const labelBudget = Math.max(4, innerWidth - fixedCells - confCells);
  const trimmedLabel =
    labelText.length > labelBudget ? `${labelText.slice(0, labelBudget - 1)}…` : labelText;
  const labelPad = Math.max(0, labelBudget - trimmedLabel.length);
  const segs: Segment[] = [
    { text: marker, tone: focused ? "accent" : "default" },
    { text: idText, tone: "dim" },
    { text: " ", tone: "default" },
    { text: trimmedLabel, tone: focused ? "default" : "muted" },
    { text: " ".repeat(labelPad), tone: "default" },
  ];
  if (confText) {
    segs.push({ text: " ", tone: "default" });
    segs.push({ text: confText, tone: focused ? "muted" : "dim" });
  }
  return Box(
    { flexDirection: "row", width: innerWidth, flexShrink: 0, overflow: "hidden" },
    Text({
      content: segmentsToStyledText(segs, display),
      attributes: focused ? TextAttributes.BOLD : TextAttributes.NONE,
      wrapMode: "char",
    }),
  );
}

function shortId(id: string): string {
  // Record ids are content-hashes (16 hex chars in MVP). Show the leading
  // 5 chars prefixed with `r` so the rail reads as `rABCDE` per row,
  // consistent across runs without exposing the full hash.
  return `r${id.slice(0, 5)}`;
}
