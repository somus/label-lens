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

export type ResolvedDisplay = {
  color: CapabilityColor;
  banding: boolean;
  theme: "light" | "dark";
  candidatePin: number;
};

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
  return { color, banding, theme, candidatePin };
}

export type ThemeProbe = {
  waitForThemeMode: (timeoutMs: number) => Promise<"light" | "dark" | null>;
};

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
