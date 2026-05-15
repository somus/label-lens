import type { DisplayConfig } from "../config/config.ts";

export type CapabilityColor = "truecolor" | "256" | "16" | "mono";

export type CapabilityEnv = {
  COLORTERM?: string;
  TERM?: string;
  NO_COLOR?: string;
};

export type Capability = {
  color: CapabilityColor;
};

export type Layout = "auto" | "stack" | "split";

export type SidebarMode = "auto" | "on" | "off";

export type ResolvedDisplay = {
  color: CapabilityColor;
  banding: boolean;
  theme: "light" | "dark";
  candidatePin: number;
  layout: Layout;
  motion: boolean;
  sidebar: SidebarMode;
};

const SPLIT_MIN_WIDTH = 160;
const SIDEBAR_MIN_WIDTH = 120;
const SIDEBAR_WIDE_WIDTH = 160;

export function pickLayout(layout: Layout, terminalWidth: number): "stack" | "split" {
  if (layout === "stack") return "stack";
  if (layout === "split") return "split";
  return terminalWidth >= SPLIT_MIN_WIDTH ? "split" : "stack";
}

/**
 * Resolve whether sidebar is visible at the given terminal width.
 * `auto`: visible when terminal ≥ 120 cols AND capability ≥ 256 colors.
 *         Capability gate matches banding/motion — sidebar's quadrant bands +
 *         gradient wordmark need color to read; at 16/mono they collapse but
 *         the layout shift would still be jarring without it being intentional.
 * `on`:   forced visible regardless of width / capability. Reviewer opt-in.
 * `off`:  hidden. Top status bar takes over.
 */
export function pickSidebar(display: ResolvedDisplay, terminalWidth: number): boolean {
  if (display.sidebar === "off") return false;
  if (display.sidebar === "on") return true;
  const supportsChrome = display.color === "truecolor" || display.color === "256";
  return terminalWidth >= SIDEBAR_MIN_WIDTH && supportsChrome;
}

/**
 * Sidebar width in columns when visible. Two-step: 24ch baseline, 32ch ≥160.
 *
 * Contract: never returns less than 24. Sidebar rendering (counter rows,
 * truncate-middle, progress bar) assumes ≥22ch of inner width. Forcing
 * `sidebar: "on"` on a terminal narrower than 24 still allocates 24 cols;
 * the parent layout will clip. Callers must not bypass this helper.
 */
export function sidebarWidth(terminalWidth: number): number {
  return terminalWidth >= SIDEBAR_WIDE_WIDTH ? 32 : 24;
}

export function detectCapability(env: CapabilityEnv): Capability {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return { color: "mono" };
  if (env.TERM === "dumb") return { color: "mono" };
  if (env.COLORTERM === "truecolor" || env.COLORTERM === "24bit") {
    return { color: "truecolor" };
  }
  if (env.TERM?.endsWith("-256color")) return { color: "256" };
  if (env.TERM) return { color: "16" };
  return { color: "mono" };
}

export type ColorAndBanding = Pick<ResolvedDisplay, "color" | "banding">;

export function applyDisplayOverrides(
  detected: Capability,
  config: DisplayConfig | undefined,
): ColorAndBanding {
  const colorOverride = config?.color;
  const color: CapabilityColor =
    colorOverride && colorOverride !== "auto" ? colorOverride : detected.color;
  const supportsBanding = color === "truecolor" || color === "256";
  const bandingMode = config?.banding ?? "auto";
  const banding = bandingMode === "off" ? false : supportsBanding;
  return { color, banding };
}

export function resolveDisplay(args: {
  detectedColor: Capability;
  detectedTheme: "light" | "dark" | null;
  config: DisplayConfig | undefined;
}): ResolvedDisplay {
  const { color, banding } = applyDisplayOverrides(args.detectedColor, args.config);
  const themeOverride = args.config?.theme;
  const theme: "light" | "dark" =
    themeOverride && themeOverride !== "auto" ? themeOverride : (args.detectedTheme ?? "light");
  const pin = args.config?.candidatePin ?? 0.4;
  const candidatePin = Math.max(0.05, Math.min(0.95, pin));
  const layout: Layout = args.config?.layout ?? "auto";
  const motionMode = args.config?.motion ?? "auto";
  const supportsMotion = color === "truecolor" || color === "256";
  // Motion is always off at 16 / mono — the fade/flash machinery has nothing
  // to render at those capability levels. `on` cannot override capability,
  // matching the `banding` clamp above.
  const motion = motionMode === "off" ? false : supportsMotion;
  const sidebar: SidebarMode = args.config?.sidebar ?? "auto";
  return { color, banding, theme, candidatePin, layout, motion, sidebar };
}

export type ThemeProbe = {
  waitForThemeMode: (timeoutMs: number) => Promise<"light" | "dark" | null>;
};

/** Lowest-common-denominator display. Test-only — production paths must call `bootstrapDisplay`. */
export function defaultDisplay(): ResolvedDisplay {
  return {
    color: "mono",
    banding: false,
    theme: "light",
    candidatePin: 0.4,
    layout: "auto",
    motion: false,
    sidebar: "auto",
  };
}

export async function bootstrapDisplay(args: {
  env: CapabilityEnv;
  themeProbe: ThemeProbe;
  config: DisplayConfig | undefined;
  themeProbeTimeoutMs?: number;
}): Promise<ResolvedDisplay> {
  const detectedColor = detectCapability(args.env);
  const detectedTheme = await args.themeProbe
    .waitForThemeMode(args.themeProbeTimeoutMs ?? 200)
    .catch(() => null);
  return resolveDisplay({ detectedColor, detectedTheme, config: args.config });
}
