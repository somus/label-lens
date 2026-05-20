import type { KeyEvent } from "../keymap/engine.ts";
import type { OverlayKeyPreset } from "./types.ts";

/**
 * Matchers for overlay-local navigation. Centralised so the `j/k` vs
 * arrow-only split between presets lives in one place — adding `simple`-only
 * variants or future preset rules means one edit, not nine reducers.
 *
 * The preset defaults to `vim` when the caller (tests, legacy paths) omits
 * it so historic j/k tests keep passing while review.ts always threads the
 * resolved preset from AppContext.
 */
function preset(p?: OverlayKeyPreset): OverlayKeyPreset {
  return p ?? "vim";
}

export function isOverlayNext(event: KeyEvent, p?: OverlayKeyPreset): boolean {
  if (event.ctrl || event.meta) return false;
  if (event.name === "down") return true;
  return preset(p) === "vim" && event.name === "j";
}

export function isOverlayPrev(event: KeyEvent, p?: OverlayKeyPreset): boolean {
  if (event.ctrl || event.meta) return false;
  if (event.name === "up") return true;
  return preset(p) === "vim" && event.name === "k";
}

/**
 * `ctrl+j` / `ctrl+k` in the filter builder move rows. Simple preset uses
 * `ctrl+down` / `ctrl+up` instead — arrow-key consistency wins over chord.
 */
export function isOverlayRowNext(event: KeyEvent, p?: OverlayKeyPreset): boolean {
  if (preset(p) === "simple") return Boolean(event.ctrl) && event.name === "down";
  return Boolean(event.ctrl) && event.name === "j";
}

export function isOverlayRowPrev(event: KeyEvent, p?: OverlayKeyPreset): boolean {
  if (preset(p) === "simple") return Boolean(event.ctrl) && event.name === "up";
  return Boolean(event.ctrl) && event.name === "k";
}
