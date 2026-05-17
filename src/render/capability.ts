import type { DisplayConfig } from "../config/config.ts";

export type CapabilityColor = "truecolor" | "256" | "16" | "mono";

export type CapabilityEnv = {
  COLORTERM?: string;
  TERM?: string;
  TERM_PROGRAM?: string;
  NO_COLOR?: string;
};

export type Capability = {
  color: CapabilityColor;
  /**
   * Whether the terminal renders smooth per-cell colour gradients
   * faithfully. Truecolor reporting alone isn't enough — some terminals
   * (Apple Terminal, VS Code on older builds, Hyper) advertise truecolor
   * but palette-quantise neighbouring cells into a blocky pattern that
   * makes a wordmark gradient look pixelated.
   *
   * We allowlist known-good terminals (iTerm2, WezTerm, Ghostty, Kitty,
   * Alacritty) rather than blocklist; unknown terminals fall back to a
   * single solid colour for the wordmark.
   */
  richGradient: boolean;
};

export type Layout = "auto" | "stack" | "split";

export type SidebarMode = "auto" | "on" | "off";

export type QueuePreviewMode = "auto" | "on" | "off";

export type ResolvedDisplay = {
  color: CapabilityColor;
  banding: boolean;
  theme: "light" | "dark";
  candidatePin: number;
  layout: Layout;
  motion: boolean;
  sidebar: SidebarMode;
  queuePreview: QueuePreviewMode;
  /**
   * Smooth gradient rendering is OK on this terminal. Wordmark renders
   * with the cyan colour ramp when true, single accent colour when false.
   * Always false at 16 / mono regardless of detection.
   */
  richGradient: boolean;
};

const SPLIT_MIN_WIDTH = 160;
const SIDEBAR_MIN_WIDTH = 120;
const SIDEBAR_FLOOR_WIDTH = 32;
const SIDEBAR_CEILING_WIDTH = 64;
const SIDEBAR_WIDTH_PERCENT = 0.3;
const QUEUE_PREVIEW_MIN_WIDTH = 200;
const QUEUE_PREVIEW_FIXED_WIDTH = 28;

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
 * Sidebar width in columns when visible. Scales as 30% of terminal width,
 * clamped to [32, 64]. The floor preserves the inner-width contract that
 * existing blocks (counter rows, truncate-middle, progress bar, half-scale
 * wordmark) assume; the ceiling keeps the main column readable on very
 * wide terminals where prose comfort tops out around 60–90ch.
 *
 * Forcing `sidebar: "on"` on a terminal narrower than 32 still allocates
 * 32 cols and the parent layout will clip. Callers must not bypass this
 * helper.
 */
export function sidebarWidth(terminalWidth: number): number {
  const scaled = Math.floor(terminalWidth * SIDEBAR_WIDTH_PERCENT);
  return Math.max(SIDEBAR_FLOOR_WIDTH, Math.min(SIDEBAR_CEILING_WIDTH, scaled));
}

/**
 * Resolve whether the left-side queue preview rail is visible. Wide
 * terminals only — below 200 cols the main column would shrink under ~80ch
 * once the sidebar takes its 30% share, which hurts reading more than the
 * rail helps navigation. Also requires the sidebar to be visible (the rail
 * is the "and you also have lots of horizontal room" affordance, not a
 * replacement for the sidebar).
 */
export function pickQueuePreview(display: ResolvedDisplay, terminalWidth: number): boolean {
  if (display.queuePreview === "off") return false;
  const sidebarVisible = pickSidebar(display, terminalWidth);
  if (display.queuePreview === "on") return sidebarVisible;
  return sidebarVisible && terminalWidth >= QUEUE_PREVIEW_MIN_WIDTH;
}

/** Fixed 28ch — enough for `r####` id + truncated label + confidence. */
export function queuePreviewWidth(): number {
  return QUEUE_PREVIEW_FIXED_WIDTH;
}

/**
 * Allowlist of terminals known to render per-cell color gradients without
 * blocky palette quantisation. Identified by `TERM_PROGRAM` (set by the
 * terminal at startup) and `TERM` (a couple of terminals set only this).
 *
 * Add a terminal here only after manual testing — the cost of a false
 * positive is a gradient that looks pixelated, which is exactly what this
 * detection is meant to avoid.
 */
const GRADIENT_OK_TERM_PROGRAMS = new Set([
  "iTerm.app",
  "WezTerm",
  "ghostty",
  "kitty",
  "tabby",
  // macOS Terminal.app advertises only 256 by default but a recent
  // build supports truecolor when COLORTERM is set. The visual issue we
  // saw with `█` cells (inter-cell grid lines) is fixed by switching to
  // background-colour rendering — see `wordmark.ts`. With that fix the
  // gradient renders cleanly on Apple_Terminal too.
  "Apple_Terminal",
]);

const GRADIENT_OK_TERMS = new Set(["alacritty", "xterm-ghostty", "xterm-kitty"]);

function detectRichGradient(env: CapabilityEnv, color: CapabilityColor): boolean {
  if (color !== "truecolor") return false;
  const prog = env.TERM_PROGRAM;
  if (prog && GRADIENT_OK_TERM_PROGRAMS.has(prog)) return true;
  const term = env.TERM;
  if (term && GRADIENT_OK_TERMS.has(term)) return true;
  return false;
}

export function detectCapability(env: CapabilityEnv): Capability {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") {
    return { color: "mono", richGradient: false };
  }
  if (env.TERM === "dumb") return { color: "mono", richGradient: false };
  let color: CapabilityColor;
  if (env.COLORTERM === "truecolor" || env.COLORTERM === "24bit") {
    color = "truecolor";
  } else if (env.TERM?.endsWith("-256color")) {
    color = "256";
  } else if (env.TERM) {
    color = "16";
  } else {
    color = "mono";
  }
  return { color, richGradient: detectRichGradient(env, color) };
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
  const queuePreview: QueuePreviewMode = args.config?.queuePreview ?? "auto";
  // Gradient detection only meaningful at truecolor. If the user forces
  // a lower color level via config, gradient is off regardless.
  const richGradient = color === "truecolor" && args.detectedColor.richGradient;
  return {
    color,
    banding,
    theme,
    candidatePin,
    layout,
    motion,
    sidebar,
    queuePreview,
    richGradient,
  };
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
    queuePreview: "auto",
    richGradient: false,
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
