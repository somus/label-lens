import type { ResolvedDisplay } from "./capability.ts";

/**
 * Capability-aware glyph maps. Truecolor/256 render the Unicode glyph; 16/mono
 * fall back to ASCII so the row still reads on legacy terminals. The fallback
 * set matches what the slice-3 history strip shipped with (`+~->?<`).
 */

function richGlyphs(display: ResolvedDisplay): boolean {
  return display.color === "truecolor" || display.color === "256";
}

const STATUS_RICH: Record<string, string> = {
  accepted: "✓",
  relabeled: "↻",
  rejected: "✗",
  skipped: "»",
  undone: "↶",
  pending: "○",
};

const STATUS_ASCII: Record<string, string> = {
  accepted: "+",
  relabeled: "~",
  rejected: "-",
  skipped: ">",
  undone: "<",
  pending: "?",
};

export function statusGlyph(status: string, display: ResolvedDisplay): string {
  const map = richGlyphs(display) ? STATUS_RICH : STATUS_ASCII;
  return map[status] ?? (richGlyphs(display) ? "●" : "?");
}

const ISSUE_RICH: Record<string, string> = {
  low_confidence: "⚠",
  source_disagreement: "⚡",
  exact_duplicate: "⧉",
};

export function issueGlyph(issueType: string, display: ResolvedDisplay): string {
  if (!richGlyphs(display)) return "!";
  return ISSUE_RICH[issueType] ?? "●";
}

export type FlashKind = "success" | "info" | "warning" | "error";

const FLASH_RICH: Record<FlashKind, string> = {
  success: "✓",
  info: "ⓘ",
  warning: "⚠",
  error: "✗",
};

const FLASH_ASCII: Record<FlashKind, string> = {
  success: "+",
  info: "i",
  warning: "!",
  error: "x",
};

export function flashGlyph(kind: FlashKind, display: ResolvedDisplay): string {
  return (richGlyphs(display) ? FLASH_RICH : FLASH_ASCII)[kind];
}

/**
 * Built-in boundary-task label kind → glyph defaults. User config
 * `labels[].glyph` overrides per label. Unknown labels fall back to bullet.
 */
const KIND_RICH: Record<string, string> = {
  SECTION_HEADER: "━━",
  SUBSECTION_HEADER: "──",
  ENTRY_START: "▶",
  CONTINUATION: "⋅",
  FOOTNOTE: "↓",
  OUTRO: "↓",
};

export function kindGlyph(labelName: string, display: ResolvedDisplay): string {
  if (!richGlyphs(display)) return " ";
  return KIND_RICH[labelName] ?? "·";
}

export type KindTintLevel = "heavy" | "medium" | "light";

const KIND_TINT: Record<string, KindTintLevel> = {
  SECTION_HEADER: "heavy",
  SUBSECTION_HEADER: "medium",
  ENTRY_START: "medium",
  CONTINUATION: "light",
  FOOTNOTE: "light",
  OUTRO: "light",
};

/** Default kind-tint level for a boundary label name. User config overrides. */
export function kindTintLevel(labelName: string): KindTintLevel | null {
  return KIND_TINT[labelName] ?? null;
}
