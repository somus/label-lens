import type { Segment } from "../render/chrome/index.ts";
import type { Overlay } from "./types.ts";

/**
 * Footer hints shown in the chrome bottom strip while an overlay is open.
 * Each overlay owns its own hint set so adding/renaming a key in the overlay
 * reducer doesn't require touching review.ts (or any other host screen).
 */
export function overlayFooterHint(overlay: Overlay): Segment[] {
  switch (overlay.kind) {
    case "palette": {
      const inPicker = overlay.state.mode === "pick";
      if (inPicker) {
        return [
          { text: "[enter] ", tone: "accent" },
          { text: "select  ", tone: "muted" },
          { text: "[↑↓] ", tone: "accent" },
          { text: "navigate  ", tone: "muted" },
          { text: "[esc] ", tone: "accent" },
          { text: "back", tone: "muted" },
        ];
      }
      return [
        { text: "[enter] ", tone: "accent" },
        { text: "run  ", tone: "muted" },
        { text: "[↑↓] ", tone: "accent" },
        { text: "navigate  ", tone: "muted" },
        { text: "[^p/^n] ", tone: "accent" },
        { text: "history  ", tone: "muted" },
        { text: "[esc] ", tone: "accent" },
        { text: "close", tone: "muted" },
      ];
    }
    case "picker":
      return [
        { text: "[enter] ", tone: "accent" },
        { text: "commit  ", tone: "muted" },
        { text: "[1-9] ", tone: "accent" },
        { text: "pick  ", tone: "muted" },
        { text: "[esc] ", tone: "accent" },
        { text: "cancel", tone: "muted" },
      ];
    case "note":
      return [
        { text: "[enter] ", tone: "accent" },
        { text: "save  ", tone: "muted" },
        { text: "[esc] ", tone: "accent" },
        { text: "cancel", tone: "muted" },
      ];
    case "help":
    case "guidelines":
    case "stats":
      return [
        { text: "[↑↓] ", tone: "accent" },
        { text: "scroll  ", tone: "muted" },
        { text: "[esc] ", tone: "accent" },
        { text: "close", tone: "muted" },
      ];
    case "assistant":
      return [
        { text: "[esc] ", tone: "accent" },
        { text: "close assistant", tone: "muted" },
      ];
  }
}

export function flashFooterHint(
  flash: { message: string; kind: "info" | "error" } | null,
): Segment[] | undefined {
  if (!flash) return undefined;
  return [
    { text: " ! ", tone: flash.kind === "error" ? "danger" : "warning" },
    { text: flash.message, tone: "bold" },
  ];
}
