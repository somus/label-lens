import { reduceGuidelines } from "./guidelines.ts";
import { reduceHelp } from "./help.ts";
import { reduceNote } from "./note.ts";
import { reducePalette } from "./palette.ts";
import { reducePicker } from "./picker.ts";
import type { Overlay, OverlayEvent, ReduceResult } from "./types.ts";

/** Top-level dispatch over the Overlay union. */
export function reduceOverlay(overlay: Overlay, event: OverlayEvent): ReduceResult {
  switch (overlay.kind) {
    case "picker":
      return reducePicker(overlay.state, event);
    case "note":
      return reduceNote(overlay.state, event);
    case "assistant":
      // Slice 11 will plug in reduceAssistant. Until then, any event closes.
      return { overlay: null, effects: [{ kind: "close" }] };
    case "palette":
      return reducePalette(overlay.state, event);
    case "help":
      return reduceHelp(overlay.state, event);
    case "guidelines":
      return reduceGuidelines(overlay.state, event);
  }
}
