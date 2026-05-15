/**
 * OKLab color interpolation. CRUSH (via `go-colorful` + `lipgloss.Blend1D`)
 * blends in Lab space because linear sRGB interpolation produces visible
 * banding when the endpoint colors are perceptually similar — adjacent
 * ramp stops quantise to the same 256-palette index even on truecolor
 * terminals after dithering. OKLab steps are perceptually uniform, so
 * each ramp index has a visible difference from its neighbour.
 *
 * Reference: https://bottosson.github.io/posts/oklab/
 *
 * The forward / inverse math here is the canonical OKLab/sRGB pair. We
 * keep it inlined to avoid pulling a color library — the wordmark is the
 * only call site for now.
 */

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function parseHex(s: string): [number, number, number] | null {
  if (s.length !== 4 && s.length !== 7) return null;
  if (s[0] !== "#") return null;
  const hex = s.length === 4 ? `${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : s.slice(1);
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return null;
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r / 255);
  const gl = srgbToLinear(g / 255);
  const bl = srgbToLinear(b / 255);
  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;
  const lc = Math.cbrt(l);
  const mc = Math.cbrt(m);
  const sc = Math.cbrt(s);
  return [
    0.2104542553 * lc + 0.793617785 * mc - 0.0040720468 * sc,
    1.9779984951 * lc - 2.428592205 * mc + 0.4505937099 * sc,
    0.0259040371 * lc + 0.7827717662 * mc - 0.808675766 * sc,
  ];
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const lc = L + 0.3963377774 * a + 0.2158037573 * b;
  const mc = L - 0.1055613458 * a - 0.0638541728 * b;
  const sc = L - 0.0894841775 * a - 1.291485548 * b;
  const lL = lc ** 3;
  const mL = mc ** 3;
  const sL = sc ** 3;
  const r = 4.0767416621 * lL - 3.3077115913 * mL + 0.2309699292 * sL;
  const g = -1.2684380046 * lL + 2.6097574011 * mL - 0.3413193965 * sL;
  const bB = -0.0041960863 * lL - 0.7034186147 * mL + 1.707614701 * sL;
  return [
    255 * linearToSrgb(Math.max(0, Math.min(1, r))),
    255 * linearToSrgb(Math.max(0, Math.min(1, g))),
    255 * linearToSrgb(Math.max(0, Math.min(1, bB))),
  ];
}

/**
 * Interpolate two sRGB hex colors in OKLab space. `t` is clamped to [0, 1].
 * Falls back to the `to` color if either input fails to parse.
 */
export function lerpOklab(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return to;
  const k = Math.max(0, Math.min(1, t));
  const la = rgbToOklab(a[0], a[1], a[2]);
  const lb = rgbToOklab(b[0], b[1], b[2]);
  const li: [number, number, number] = [
    la[0] + (lb[0] - la[0]) * k,
    la[1] + (lb[1] - la[1]) * k,
    la[2] + (lb[2] - la[2]) * k,
  ];
  const [r, g, bB] = oklabToRgb(li[0], li[1], li[2]);
  return toHex(r, g, bB);
}
