import { reduceNote } from "./note.ts";
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
  }
}
