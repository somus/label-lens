import type { ResolvedDisplay } from "./capability.ts";

/**
 * Token taxonomy. Names align with the termcn / shadcn terminal token system:
 *   fg.*       — foregrounds (default, muted, dim, accent, success, warning,
 *                danger, info, disabled). Apply via `fg(token)(text)` chunks.
 *   bg.*       — backgrounds. canvas/chrome/overlay set the substrate;
 *                band.even/odd power record banding; soft.* tint Badge fills.
 *   border.*   — single-source rules for border colors. Pair with
 *                `borderForScope` (below) for the matching glyph style.
 *
 * To add a new foreground tone:
 *   1. Add it to `fg` in `ThemeTokens`.
 *   2. Fill every palette (truecolor/256 light+dark, ansi16, mono).
 *   3. Wire it in `chrome/status-bar.ts:chunkFor` — TypeScript's exhaustiveness
 *      check will flag the missing case.
 */
export type ThemeTokens = {
  fg: {
    default: string;
    muted: string;
    dim: string;
    accent: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
    disabled: string;
  };
  bg: {
    canvas: string;
    chrome: string;
    overlay: string;
    band: { even: string; odd: string };
    soft: {
      success: string;
      warning: string;
      danger: string;
      info: string;
    };
  };
  border: {
    subtle: string;
    accent: string;
    focus: string;
  };
};

const TRANSPARENT = "transparent";

function truecolorTokens(dark: boolean): ThemeTokens {
  return dark
    ? {
        fg: {
          default: "#e6e6e6",
          muted: "#9aa3ad",
          dim: "#5e6772",
          accent: "#7ec8ff",
          success: "#7fd793",
          warning: "#e0b46a",
          danger: "#e07b7b",
          info: "#8ab4ff",
          disabled: "#4a4f55",
        },
        bg: {
          canvas: TRANSPARENT,
          chrome: "#1a1a1a",
          overlay: "#202225",
          band: { even: "#1f1f1f", odd: "#252525" },
          soft: {
            success: "#1d3322",
            warning: "#3a2d12",
            danger: "#3a1d1d",
            info: "#1c2740",
          },
        },
        border: { subtle: "#3a3f44", accent: "#7ec8ff", focus: "#7ec8ff" },
      }
    : {
        fg: {
          default: "#1f2328",
          muted: "#57606a",
          dim: "#8c959f",
          accent: "#0066cc",
          success: "#1a7f37",
          warning: "#9a6700",
          danger: "#a40e26",
          info: "#0550ae",
          disabled: "#b8bfc6",
        },
        bg: {
          canvas: TRANSPARENT,
          chrome: "#f5f7fa",
          overlay: "#ffffff",
          band: { even: "#f5f5f5", odd: "#ebebeb" },
          soft: {
            success: "#dafbe1",
            warning: "#fff4d6",
            danger: "#ffebe9",
            info: "#ddf4ff",
          },
        },
        border: { subtle: "#d0d7de", accent: "#0066cc", focus: "#0066cc" },
      };
}

function tokens256(dark: boolean): ThemeTokens {
  return dark
    ? {
        fg: {
          default: "#e0e0e0",
          muted: "#a0a0a0",
          dim: "#606060",
          accent: "#7ec8ff",
          success: "#7fd793",
          warning: "#e0b46a",
          danger: "#e07b7b",
          info: "#8ab4ff",
          disabled: "#505050",
        },
        bg: {
          canvas: TRANSPARENT,
          chrome: "#202020",
          overlay: "#262626",
          band: { even: "#2a2a2a", odd: "#3a3a3a" },
          soft: {
            success: "#1f3a25",
            warning: "#3d3015",
            danger: "#3d2020",
            info: "#1f2a44",
          },
        },
        border: { subtle: "#3a3a3a", accent: "#7ec8ff", focus: "#7ec8ff" },
      }
    : {
        fg: {
          default: "#202020",
          muted: "#5a5a5a",
          dim: "#909090",
          accent: "#0050a0",
          success: "#0a7030",
          warning: "#8a5a00",
          danger: "#a02020",
          info: "#0040a0",
          disabled: "#b0b0b0",
        },
        bg: {
          canvas: TRANSPARENT,
          chrome: "#eaeaea",
          overlay: "#ffffff",
          band: { even: "#eaeaea", odd: "#d4d4d4" },
          soft: {
            success: "#d4f0db",
            warning: "#fff0c8",
            danger: "#ffd8d4",
            info: "#d4ecff",
          },
        },
        border: { subtle: "#c0c0c0", accent: "#0050a0", focus: "#0050a0" },
      };
}

function ansi16Tokens(dark: boolean): ThemeTokens {
  return {
    fg: {
      default: "white",
      muted: dark ? "gray" : "black",
      dim: "gray",
      accent: "cyan",
      success: "green",
      warning: "yellow",
      danger: "red",
      info: "blue",
      disabled: "gray",
    },
    bg: {
      canvas: TRANSPARENT,
      chrome: TRANSPARENT,
      overlay: TRANSPARENT,
      band: { even: TRANSPARENT, odd: TRANSPARENT },
      soft: {
        success: TRANSPARENT,
        warning: TRANSPARENT,
        danger: TRANSPARENT,
        info: TRANSPARENT,
      },
    },
    border: { subtle: "gray", accent: "cyan", focus: "cyan" },
  };
}

function monoTokens(): ThemeTokens {
  return {
    fg: {
      default: "white",
      muted: "white",
      dim: "gray",
      accent: "white",
      success: "white",
      warning: "white",
      danger: "white",
      info: "white",
      disabled: "gray",
    },
    bg: {
      canvas: TRANSPARENT,
      chrome: TRANSPARENT,
      overlay: TRANSPARENT,
      band: { even: TRANSPARENT, odd: TRANSPARENT },
      soft: {
        success: TRANSPARENT,
        warning: TRANSPARENT,
        danger: TRANSPARENT,
        info: TRANSPARENT,
      },
    },
    border: { subtle: "white", accent: "white", focus: "white" },
  };
}

export function resolveTheme(display: ResolvedDisplay): ThemeTokens {
  const dark = display.theme === "dark";
  switch (display.color) {
    case "truecolor":
      return truecolorTokens(dark);
    case "256":
      return tokens256(dark);
    case "16":
      return ansi16Tokens(dark);
    case "mono":
      return monoTokens();
  }
}

/**
 * Capability-aware border glyph for a given role.
 *   - focus  → focus box around the active record (rounded at 256+, single
 *              otherwise so the corners don't degrade to garbage).
 *   - overlay → palette / picker / note / help / guidelines containers.
 *   - subtle → quiet section dividers (Card-style sub-panels).
 *
 * Mono and 16-color terminals always get `single` — rounded glyphs (`╭╮`)
 * survive any modern terminal but `single` is the most predictable fallback
 * and matches what the slice-3 BandedRecord already does for left markers.
 */
export type BorderRole = "focus" | "overlay" | "subtle";

export function borderForRole(
  display: ResolvedDisplay,
  role: BorderRole,
): "rounded" | "single" | "double" {
  if (display.color === "mono" || display.color === "16") return "single";
  switch (role) {
    case "focus":
      return "rounded";
    case "overlay":
      return "rounded";
    case "subtle":
      return "single";
  }
}
