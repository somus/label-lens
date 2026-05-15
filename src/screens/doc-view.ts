import type { AppContext } from "../app/context.ts";
import { Box } from "../render/box.ts";
import type { ResolvedDisplay } from "../render/capability.ts";
import { CHROME_ROW_OVERHEAD } from "../render/chrome/index.ts";
import { segmentsToStyledText } from "../render/chrome/status-bar.ts";
import { Scrollbar } from "../render/scrollbar.ts";
import { Text, TextAttributes } from "../render/text.ts";
import { resolveTheme } from "../render/theme.ts";
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
  // Chrome reserves CHROME_ROW_OVERHEAD rows + 1 for the inline doc header.
  const viewport = viewportHeight(terminalHeight - CHROME_ROW_OVERHEAD - 1);
  const maxScroll = Math.max(0, lines.rows.length - viewport);
  const scrollTop = Math.max(0, Math.min(app.docView.scrollTop, maxScroll));
  // Normalize stored state so subsequent commands see the same upper bound
  // the renderer enforces. Without this, jumping to bottom (G) leaves
  // scrollTop > maxScroll and page-up/k presses appear to do nothing until
  // the value drops below maxScroll.
  if (scrollTop !== app.docView.scrollTop) {
    app.docView.scrollTop = scrollTop;
  }
  const visible = lines.rows.slice(scrollTop, scrollTop + viewport);
  const display = app.display;
  const supportsColor = display.color === "truecolor" || display.color === "256";

  const focusedId = lines.rows[lines.focusedIndex]?.id;
  const rows = visible.map((r) => focusedLineRow(r, r.id === focusedId, display, supportsColor));

  return Box(
    { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
    docHeaderRow(lines, display),
    Box({ height: 1 }),
    Box(
      { flexDirection: "row", flexGrow: 1, overflow: "hidden" },
      Box({ flexDirection: "column", flexGrow: 1, overflow: "hidden" }, ...rows),
      // Right-edge mini scrollbar (plan F3). 1ch column, alongside the
      // viewport rows.
      Scrollbar({
        display,
        total: lines.rows.length,
        visible: viewport,
        scrollTop,
        caps: true,
      }),
    ),
  );
}

/**
 * Doc view header (plan F1). Quadrant prefix chip in `fg.accentDeep`, the
 * doc id in `fg.default`, then a right-anchored `N / total` position in
 * `fg.muted`. Caller's Chrome row supplies an empty spacer below, so this
 * stays a single line.
 */
function docHeaderRow(lines: DocViewLines, display: ResolvedDisplay): ReturnType<typeof Text> {
  const position = `${lines.focusedIndex + 1} / ${lines.rows.length}`;
  return Text({
    content: segmentsToStyledText(
      [
        { text: "▞▚ ", tone: "accentDeep" },
        { text: "Doc: ", tone: "muted" },
        { text: lines.documentId, tone: "default" },
        { text: "  ", tone: "default" },
        { text: position, tone: "muted" },
      ],
      display,
    ),
    attributes: TextAttributes.BOLD,
  });
}

/**
 * Focused-line stripe (plan F2). 1ch vertical accent bar at the left
 * edge of the focused row + bold text. Non-focused rows render dim
 * (context variant) so the focused line pops without bg fill.
 */
function focusedLineRow(
  record: RecordWithPrimaryPrediction,
  isFocused: boolean,
  display: ResolvedDisplay,
  supportsColor: boolean,
): ReturnType<typeof Box> {
  if (isFocused && supportsColor) {
    const t = resolveTheme(display);
    return Box(
      { flexDirection: "row", flexShrink: 0 },
      Text({
        content: segmentsToStyledText([{ text: "▊ ", tone: "accent" }], display),
        attributes: TextAttributes.NONE,
        fg: t.fg.accent,
      }),
      Text({ content: record.text, attributes: TextAttributes.BOLD }),
    );
  }
  if (isFocused) {
    // Mono / 16-color fallback: bold prefix arrow keeps the focused line
    // legible without color.
    return Box(
      { flexDirection: "row", flexShrink: 0 },
      Text({ content: "▶ ", attributes: TextAttributes.BOLD }),
      Text({ content: record.text, attributes: TextAttributes.BOLD }),
    );
  }
  return Box(
    { flexDirection: "row", flexShrink: 0 },
    Text({ content: "  ", attributes: TextAttributes.DIM }),
    Text({ content: record.text, attributes: TextAttributes.DIM }),
  );
}
