import type { FlashKind } from "../app/context.ts";
import type { ResolvedDisplay } from "../render/capability.ts";
import type { Segment } from "../render/chrome/index.ts";
import { flashGlyph } from "../render/glyph-map.ts";

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
