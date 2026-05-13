import type { ResolvedDisplay } from "./capability.ts";

export type ThemeTokens = {
  fg: {
    default: string;
    muted: string;
    dim: string;
    accent: string;
    success: string;
    warning: string;
    danger: string;
    disabled: string;
  };
  bg: {
    canvas: string;
    chrome: string;
    overlay: string;
  };
  border: {
    subtle: string;
    accent: string;
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
          disabled: "#4a4f55",
        },
        bg: { canvas: TRANSPARENT, chrome: "#1a1a1a", overlay: "#202225" },
        border: { subtle: "#3a3f44", accent: "#7ec8ff" },
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
          disabled: "#b8bfc6",
        },
        bg: { canvas: TRANSPARENT, chrome: "#f5f7fa", overlay: "#ffffff" },
        border: { subtle: "#d0d7de", accent: "#0066cc" },
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
          disabled: "#505050",
        },
        bg: { canvas: TRANSPARENT, chrome: "#202020", overlay: "#262626" },
        border: { subtle: "#3a3a3a", accent: "#7ec8ff" },
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
          disabled: "#b0b0b0",
        },
        bg: { canvas: TRANSPARENT, chrome: "#eaeaea", overlay: "#ffffff" },
        border: { subtle: "#c0c0c0", accent: "#0050a0" },
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
      disabled: "gray",
    },
    bg: { canvas: TRANSPARENT, chrome: TRANSPARENT, overlay: TRANSPARENT },
    border: { subtle: "gray", accent: "cyan" },
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
      disabled: "gray",
    },
    bg: { canvas: TRANSPARENT, chrome: TRANSPARENT, overlay: TRANSPARENT },
    border: { subtle: "white", accent: "white" },
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
