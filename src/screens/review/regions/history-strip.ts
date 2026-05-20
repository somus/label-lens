import type { SidebarHistoryRow } from "../../../app/sidebar-data.ts";
import { Box } from "../../../render/box.ts";
import type { ResolvedDisplay } from "../../../render/capability.ts";
import { type Segment, segmentsToStyledText } from "../../../render/chrome/status-bar.ts";
import { statusGlyph } from "../../../render/glyph-map.ts";
import { Text, TextAttributes } from "../../../render/text.ts";
import type { StoredReview } from "../../../types.ts";

const STATUS_TONE: Record<StoredReview["status"], Segment["tone"]> = {
  accepted: "success",
  relabeled: "info",
  rejected: "danger",
  skipped: "muted",
  undone: "warning",
  pending: "dim",
};

/**
 * Horizontal one-row history strip. Rendered below the decision pane
 * when the sidebar is hidden (narrow terminals / `sidebar: off`). Same
 * source data as the sidebar history block (Prodigy pattern, PRD §14.1).
 */
export function HistoryStrip(args: {
  history: SidebarHistoryRow[];
  display: ResolvedDisplay;
}): ReturnType<typeof Box> {
  const { history, display } = args;
  if (history.length === 0) return Box({});
  const segs: Segment[] = [{ text: " history  ", tone: "muted" }];
  history.forEach((entry, i) => {
    if (i > 0) segs.push({ text: "   ·   ", tone: "dim" });
    segs.push({ text: statusGlyph(entry.status, display), tone: STATUS_TONE[entry.status] });
    segs.push({ text: " ", tone: "default" });
    segs.push({ text: entry.label ?? "—", tone: "default" });
    if (entry.batchCount && entry.batchCount > 1) {
      segs.push({ text: ` ×${entry.batchCount}`, tone: "muted" });
    }
  });
  segs.push({ text: "      ", tone: "dim" });
  segs.push({ text: "[u] undo", tone: "muted" });
  return Box(
    { flexDirection: "column", flexShrink: 0, marginTop: 1 },
    Text({
      content: segmentsToStyledText(segs, display),
      wrapMode: "word",
      attributes: TextAttributes.DIM,
    }),
  );
}
