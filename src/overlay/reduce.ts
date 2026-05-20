import { reduceAssistant } from "./assistant.ts";
import { reduceBulkConfirm } from "./bulk-confirm.ts";
import { reduceConfigureAssistant } from "./configure-assistant.ts";
import { reduceFilterBuilder } from "./filter-builder.ts";
import { reduceGuidelines } from "./guidelines.ts";
import { reduceHelp } from "./help.ts";
import { reduceNote } from "./note.ts";
import { reducePalette } from "./palette.ts";
import { reducePicker } from "./picker.ts";
import { reduceQueue } from "./queue.ts";
import { reduceStatsOverlay } from "./stats-overlay.ts";
import type { Overlay, OverlayEvent, ReduceResult } from "./types.ts";

/** Top-level dispatch over the Overlay union. */
export function reduceOverlay(overlay: Overlay, event: OverlayEvent): ReduceResult {
  switch (overlay.kind) {
    case "picker":
      return reducePicker(overlay.state, event);
    case "note":
      return reduceNote(overlay.state, event);
    case "assistant":
      return reduceAssistant(overlay.state, event);
    case "configure-assistant":
      return reduceConfigureAssistant(overlay.state, event);
    case "palette":
      return reducePalette(overlay.state, event);
    case "filter-builder":
      return reduceFilterBuilder(overlay.state, event);
    case "help":
      return reduceHelp(overlay.state, event);
    case "guidelines":
      return reduceGuidelines(overlay.state, event);
    case "stats":
      return reduceStatsOverlay(overlay.state, event);
    case "queue":
      return reduceQueue(overlay.state, event);
    case "bulk-confirm":
      return reduceBulkConfirm(overlay.state, event);
  }
}
