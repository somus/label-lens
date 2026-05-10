import type { AppContext } from "../app/context.ts";
import { BandedRecord } from "../render/banded-record.ts";
import { Box } from "../render/box.ts";
import { Text, TextAttributes } from "../render/text.ts";
import { recordsInDoc } from "../store/queries.ts";
import type { RecordWithPrimaryPrediction } from "../types.ts";

type DocViewLines = {
  documentId: string;
  rows: RecordWithPrimaryPrediction[];
  focusedIndex: number;
};

const cache = new WeakMap<AppContext, DocViewLines>();

export function loadDocLines(app: AppContext): DocViewLines | null {
  if (!app.docView) return null;
  const cached = cache.get(app);
  if (cached && cached.documentId === app.docView.documentId) return cached;
  const rows = recordsInDoc(app.db, app.docView.documentId);
  const focusedIndex = rows.findIndex((r) => r.id === app.docView!.returnRecordId);
  const lines: DocViewLines = { documentId: app.docView.documentId, rows, focusedIndex };
  cache.set(app, lines);
  return lines;
}

export function clearDocLines(app: AppContext): void {
  cache.delete(app);
}

function viewportHeight(terminalHeight: number): number {
  return Math.max(4, terminalHeight - 6);
}

export function renderDocView(app: AppContext, terminalHeight: number): ReturnType<typeof Box> {
  const lines = loadDocLines(app);
  if (!app.docView || !lines) {
    return Box(
      { flexGrow: 1, padding: 2 },
      Text({ content: "Doc view: no document loaded.", attributes: TextAttributes.DIM }),
    );
  }
  const viewport = viewportHeight(terminalHeight);
  const scrollTop = Math.max(
    0,
    Math.min(app.docView.scrollTop, Math.max(0, lines.rows.length - viewport)),
  );
  const visible = lines.rows.slice(scrollTop, scrollTop + viewport);
  const display = app.display;

  const rows = visible.map((r) => {
    const isFocused = r.id === lines.rows[lines.focusedIndex]?.id;
    return BandedRecord({
      text: r.text,
      isFocused,
      bandSlot: "even",
      display: { ...display, banding: false },
      variant: isFocused ? "queue" : "context",
    });
  });

  return Box(
    { flexDirection: "column", flexGrow: 1, padding: 1 },
    Box(
      { flexDirection: "row", justifyContent: "space-between" },
      Text({
        content: ` Doc view · ${lines.documentId} · ${lines.focusedIndex + 1} / ${lines.rows.length}`,
        attributes: TextAttributes.BOLD,
      }),
      Text({
        content: "j/k scroll · ctrl-d/u half-page · gg top · G bottom · esc/q close ",
        attributes: TextAttributes.DIM,
      }),
    ),
    Box({ height: 1 }),
    Box({ flexDirection: "column", flexGrow: 1, overflow: "hidden" }, ...rows),
  );
}
