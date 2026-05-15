import { bg as bgFn, StyledText, stringToStyledText, type TextChunk } from "@opentui/core";
import { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { lerpOklab } from "../oklab.ts";
import { Text, TextAttributes } from "../text.ts";
import { resolveTheme } from "../theme.ts";
import {
  LOGO_CELLS_FULL,
  LOGO_CELLS_HALF,
  LOGO_FULL_WIDTH,
  LOGO_HALF_WIDTH,
  type LogoCell,
} from "./logo.ts";

/**
 * LabelLens wordmark.
 *
 * The auto-generated source (`logo-data.ts`) carries one RGB per cell. That
 * works in fonts where `█` cells with subtly different colors blend into a
 * smooth gradient, but on terminals with crisper rendering / palette
 * quantization those tiny per-cell jitters surface as a pixelated chequer
 * pattern.
 *
 * Charm's CRUSH solves the same problem with `lipgloss.Blend1D`: pick two
 * end-point colors and interpolate one color **per column** across the
 * wordmark width. Adjacent columns differ by a tiny perceptual step so the
 * gradient reads as smooth regardless of font / palette. We mirror that
 * here — the cell grid in `logo-data.ts` is treated as a stencil (which
 * cells are stroke vs background), and the colour comes from a single
 * column ramp computed at render time.
 *
 * Layered shading
 *   - `█` cells render at the ramp colour for their column (full stroke).
 *   - `░` cells render as `█` but blended toward the page bg, giving a
 *     softer edge without depending on the font's `░` glyph.
 *   - Spaces / non-coloured cells stay blank.
 *
 * Endpoints — `#11a8cd` (darker cyan) → `#99ffff` (near-white cyan) —
 * pulled from the source art's left- and right-edge cells. Adjust here
 * (not in the generator) if you want to retune the gradient.
 */
const GRAD_COLOR_LEFT = "#11a8cd";
const GRAD_COLOR_RIGHT = "#99ffff";

/** Blend factor toward bg for `░` shade cells. Restores the source art's
 *  edge anti-alias on rich-gradient terminals where the shade glyph and
 *  blended colour both render cleanly. */
const SHADE_BLEND_TOWARD_BG = 0.35;

export function Wordmark(props: {
  display: ResolvedDisplay;
  innerWidth: number;
}): ReturnType<typeof Box> {
  const { display, innerWidth } = props;
  const rich = display.color === "truecolor" || display.color === "256";

  if (!rich) return monoFallback(innerWidth);

  if (innerWidth >= LOGO_FULL_WIDTH) {
    return renderCells(display, innerWidth, LOGO_CELLS_FULL);
  }
  if (innerWidth >= LOGO_HALF_WIDTH) {
    return renderCells(display, innerWidth, LOGO_CELLS_HALF);
  }
  return monoFallback(innerWidth);
}

function renderCells(
  display: ResolvedDisplay,
  innerWidth: number,
  rows: readonly (readonly LogoCell[])[],
): ReturnType<typeof Box> {
  const logoWidth = rows[0]?.length ?? 0;
  const padTotal = Math.max(0, innerWidth - logoWidth);
  const padLeft = Math.floor(padTotal / 2);
  const leftPad = " ".repeat(padLeft);

  // Allowlist-detect (capability.richGradient) whether the terminal renders
  // smooth per-cell gradients faithfully. Bad terminals get a single solid
  // colour for every stroke cell — no banding, no quantisation surprises.
  const ramp = display.richGradient
    ? buildColumnRamp(logoWidth, GRAD_COLOR_LEFT, GRAD_COLOR_RIGHT)
    : new Array(logoWidth).fill(GRAD_COLOR_RIGHT);

  // Shade cells (`░`) restore source-art edge softening, but only on
  // terminals that render gradients cleanly. Elsewhere they collapse to
  // space — the shade glyph quantises wildly per font and the dim colour
  // lands on a different palette index than the adjacent stroke, which
  // is the exact pixelation we detected and want to avoid.
  const t = resolveTheme(display);
  const bgHex = t.bg.chrome !== "transparent" ? t.bg.chrome : "#0d1117";

  return Box(
    { flexDirection: "column" },
    ...rows.map((row) => {
      // Accumulate runs of plain (uncoloured) cells into one chunk via
      // `stringToStyledText`, and emit each coloured cell as its own
      // `bgFn` chunk. Avoids hand-casting `{ __isChunk: true, ... }` —
      // `stringToStyledText` is the documented opentui constructor for
      // plain text chunks.
      const chunks: TextChunk[] = [];
      let plainBuf = leftPad;
      const flushPlain = () => {
        if (plainBuf.length > 0) {
          chunks.push(...stringToStyledText(plainBuf).chunks);
          plainBuf = "";
        }
      };
      for (let col = 0; col < row.length; col++) {
        const cell = row[col];
        if (!cell) continue;
        const isStroke = cell.ch === "█";
        const isShade = cell.ch === "░";
        if (!isStroke && !isShade) {
          plainBuf += " ";
          continue;
        }
        // Shade cells only render on rich-gradient terminals. Elsewhere
        // they collapse to space — blocky but consistent.
        if (isShade && !display.richGradient) {
          plainBuf += " ";
          continue;
        }
        flushPlain();
        const colColor = ramp[col] ?? GRAD_COLOR_LEFT;
        const color = isShade ? lerpOklab(colColor, bgHex, SHADE_BLEND_TOWARD_BG) : colColor;
        // Render as a space with background colour rather than `█` with
        // foreground colour. `█` glyphs render with a slight inter-cell
        // gap on many terminal fonts (Apple Terminal, VS Code, etc.) —
        // bg colour fills the entire cell box, so adjacent cells of the
        // same colour form a seamless block.
        chunks.push(bgFn(color)(" "));
      }
      flushPlain();
      return Text({
        content: new StyledText(chunks),
        attributes: TextAttributes.NONE,
        wrapMode: "char",
      });
    }),
  );
}

/**
 * OKLab-space column ramp. Each step is perceptually uniform so adjacent
 * stops have visible separation, matching how CRUSH renders its title
 * via `lipgloss.Blend1D` (Lab interpolation under the hood).
 */
function buildColumnRamp(width: number, c1: string, c2: string): string[] {
  if (width <= 0) return [];
  if (width === 1) return [c1];
  const out: string[] = new Array(width);
  const denom = width - 1;
  for (let i = 0; i < width; i++) out[i] = lerpOklab(c1, c2, i / denom);
  return out;
}

function monoFallback(innerWidth: number): ReturnType<typeof Box> {
  const rule = "─".repeat(Math.max(1, innerWidth));
  return Box(
    { flexDirection: "column" },
    Text({ content: rule }),
    Text({ content: centerText(" LabelLens ", innerWidth), attributes: TextAttributes.BOLD }),
    Text({ content: rule }),
  );
}

function centerText(s: string, width: number): string {
  if (s.length >= width) return s;
  const pad = width - s.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return " ".repeat(left) + s + " ".repeat(right);
}
