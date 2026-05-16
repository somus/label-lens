import type { FlashKind } from "../app/context.ts";
import type { ResolvedDisplay } from "../render/capability.ts";
import type { Segment } from "../render/chrome/index.ts";
import { flashGlyph } from "../render/glyph-map.ts";
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
    case "filter-builder":
      return [
        { text: "[enter] ", tone: "accent" },
        { text: "apply  ", tone: "muted" },
        { text: "[←→/↑↓] ", tone: "accent" },
        { text: "edit  ", tone: "muted" },
        { text: "[^j/^k] ", tone: "accent" },
        { text: "row  ", tone: "muted" },
        { text: "[esc] ", tone: "accent" },
        { text: "cancel", tone: "muted" },
      ];
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
    case "queue":
      return [
        { text: "[j/k] ", tone: "accent" },
        { text: "navigate  ", tone: "muted" },
        { text: "[enter] ", tone: "accent" },
        { text: "select  ", tone: "muted" },
        { text: "[esc] ", tone: "accent" },
        { text: "cancel", tone: "muted" },
      ];
    case "assistant":
      return [
        { text: "[esc] ", tone: "accent" },
        { text: "close assistant", tone: "muted" },
      ];
  }
}

/**
 * Flash footer override. Replaces the action footer with `<glyph> <message>`
 * for the flash's duration. Plan D2 — per-kind glyph + bold message:
 *   success `✓` (success tone)
 *   info    `ⓘ` (info tone)
 *   warning `⚠` (warning tone)
 *   error   `✗` (danger tone)
 *
 * Mono / 16-color fallback: glyph degrades to ASCII via `flashGlyph`; the
 * tone segment still bolds the text. Plan D5 fade animation is driven by the
 * caller via motion controller (sudden swap at mono).
 */
export function flashFooterHint(
  flash: { message: string; kind: FlashKind } | null,
  display: ResolvedDisplay,
  solidBg = false,
): Segment[] | undefined {
  if (!flash) return undefined;
  const glyph = flashGlyph(flash.kind, display);
  // On a solid-tone toast background (plan D5), the glyph + message fg
  // need to contrast with the bg, not match it. We force "default" fg
  // (theme-aware) for the message and drop the tone match on the glyph —
  // both are legible against any of the four tone bgs we paint.
  const glyphTone: Segment["tone"] = solidBg
    ? "default"
    : flash.kind === "success"
      ? "success"
      : flash.kind === "warning"
        ? "warning"
        : flash.kind === "error"
          ? "danger"
          : "info";
  return [
    { text: ` ${glyph} `, tone: glyphTone },
    { text: flash.message, tone: solidBg ? "default" : "bold" },
  ];
}
