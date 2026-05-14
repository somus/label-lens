import { describe, expect, test } from "bun:test";
import {
  applyDisplayOverrides,
  bootstrapDisplay,
  detectCapability,
  pickLayout,
  resolveDisplay,
} from "../../src/render/capability.ts";

describe("detectCapability", () => {
  test("COLORTERM=truecolor → truecolor", () => {
    expect(detectCapability({ COLORTERM: "truecolor", TERM: "xterm-256color" }).color).toBe(
      "truecolor",
    );
  });

  test("COLORTERM=24bit → truecolor", () => {
    expect(detectCapability({ COLORTERM: "24bit", TERM: "xterm" }).color).toBe("truecolor");
  });

  test("TERM ending in -256color (no COLORTERM) → 256", () => {
    expect(detectCapability({ TERM: "xterm-256color" }).color).toBe("256");
    expect(detectCapability({ TERM: "screen-256color" }).color).toBe("256");
  });

  test("NO_COLOR set → mono", () => {
    expect(detectCapability({ NO_COLOR: "1", TERM: "xterm-256color" }).color).toBe("mono");
  });

  test("TERM=dumb → mono", () => {
    expect(detectCapability({ TERM: "dumb" }).color).toBe("mono");
  });

  test("any other TERM (no truecolor / 256 / mono signal) → 16", () => {
    expect(detectCapability({ TERM: "xterm" }).color).toBe("16");
    expect(detectCapability({ TERM: "linux" }).color).toBe("16");
  });

  test("empty env → mono (no signal at all)", () => {
    expect(detectCapability({}).color).toBe("mono");
  });
});

describe("applyDisplayOverrides", () => {
  test("undefined override returns detected", () => {
    const detected = { color: "truecolor" as const };
    expect(applyDisplayOverrides(detected, undefined)).toEqual({
      color: "truecolor",
      banding: true,
    });
  });

  test("display.color forces a different level", () => {
    const detected = { color: "truecolor" as const };
    expect(applyDisplayOverrides(detected, { color: "mono" }).color).toBe("mono");
  });

  test("display.color = 'auto' keeps detected", () => {
    const detected = { color: "256" as const };
    expect(applyDisplayOverrides(detected, { color: "auto" }).color).toBe("256");
  });

  test("display.banding = 'off' disables banding", () => {
    const detected = { color: "truecolor" as const };
    expect(applyDisplayOverrides(detected, { banding: "off" }).banding).toBe(false);
  });

  test("display.banding = 'on' or 'auto' keeps banding on for color terminals", () => {
    const detected = { color: "truecolor" as const };
    expect(applyDisplayOverrides(detected, { banding: "auto" }).banding).toBe(true);
    expect(applyDisplayOverrides(detected, { banding: "on" }).banding).toBe(true);
  });

  test("16/mono never have banding even when 'on'", () => {
    const detected = { color: "16" as const };
    expect(applyDisplayOverrides(detected, { banding: "on" }).banding).toBe(false);
    const mono = { color: "mono" as const };
    expect(applyDisplayOverrides(mono, { banding: "on" }).banding).toBe(false);
  });
});

describe("resolveDisplay", () => {
  test("uses detected values + config defaults when no overrides", () => {
    const r = resolveDisplay({
      detectedColor: { color: "truecolor" },
      detectedTheme: "dark",
      config: undefined,
    });
    expect(r).toEqual({
      color: "truecolor",
      banding: true,
      theme: "dark",
      candidatePin: 0.4,
      layout: "auto",
      motion: true,
    });
  });

  test("falls back to light when detectedTheme is null", () => {
    const r = resolveDisplay({
      detectedColor: { color: "truecolor" },
      detectedTheme: null,
      config: undefined,
    });
    expect(r.theme).toBe("light");
  });

  test("display.theme override wins over detection", () => {
    const r = resolveDisplay({
      detectedColor: { color: "truecolor" },
      detectedTheme: "dark",
      config: { theme: "light" },
    });
    expect(r.theme).toBe("light");
  });

  test("display.theme = 'auto' keeps detected", () => {
    const r = resolveDisplay({
      detectedColor: { color: "truecolor" },
      detectedTheme: "dark",
      config: { theme: "auto" },
    });
    expect(r.theme).toBe("dark");
  });

  test("display.candidatePin override applied; clamped to (0, 1)", () => {
    expect(
      resolveDisplay({
        detectedColor: { color: "truecolor" },
        detectedTheme: "light",
        config: { candidatePin: 0.25 },
      }).candidatePin,
    ).toBe(0.25);
    expect(
      resolveDisplay({
        detectedColor: { color: "truecolor" },
        detectedTheme: "light",
        config: { candidatePin: 1.5 },
      }).candidatePin,
    ).toBe(0.95);
    expect(
      resolveDisplay({
        detectedColor: { color: "truecolor" },
        detectedTheme: "light",
        config: { candidatePin: -0.5 },
      }).candidatePin,
    ).toBe(0.05);
  });

  test("default layout is 'auto' when no config", () => {
    expect(
      resolveDisplay({
        detectedColor: { color: "truecolor" },
        detectedTheme: "light",
        config: undefined,
      }).layout,
    ).toBe("auto");
  });

  test("display.layout override survives resolution", () => {
    expect(
      resolveDisplay({
        detectedColor: { color: "truecolor" },
        detectedTheme: "light",
        config: { layout: "split" },
      }).layout,
    ).toBe("split");
    expect(
      resolveDisplay({
        detectedColor: { color: "truecolor" },
        detectedTheme: "light",
        config: { layout: "stack" },
      }).layout,
    ).toBe("stack");
  });

  test("display.motion auto follows color capability", () => {
    expect(
      resolveDisplay({
        detectedColor: { color: "truecolor" },
        detectedTheme: "light",
        config: { motion: "auto" },
      }).motion,
    ).toBe(true);
    expect(
      resolveDisplay({
        detectedColor: { color: "256" },
        detectedTheme: "light",
        config: { motion: "auto" },
      }).motion,
    ).toBe(true);
    expect(
      resolveDisplay({
        detectedColor: { color: "16" },
        detectedTheme: "light",
        config: { motion: "auto" },
      }).motion,
    ).toBe(false);
    expect(
      resolveDisplay({
        detectedColor: { color: "mono" },
        detectedTheme: "light",
        config: { motion: "auto" },
      }).motion,
    ).toBe(false);
  });

  test("display.motion 'off' wins over capability; 'on' cannot re-enable 16 / mono", () => {
    expect(
      resolveDisplay({
        detectedColor: { color: "truecolor" },
        detectedTheme: "light",
        config: { motion: "off" },
      }).motion,
    ).toBe(false);
    // Capability is load-bearing: motion machinery has nothing to render at
    // 16 / mono, so 'on' is clamped to the capability ceiling.
    expect(
      resolveDisplay({
        detectedColor: { color: "mono" },
        detectedTheme: "light",
        config: { motion: "on" },
      }).motion,
    ).toBe(false);
    expect(
      resolveDisplay({
        detectedColor: { color: "16" },
        detectedTheme: "light",
        config: { motion: "on" },
      }).motion,
    ).toBe(false);
    expect(
      resolveDisplay({
        detectedColor: { color: "truecolor" },
        detectedTheme: "light",
        config: { motion: "on" },
      }).motion,
    ).toBe(true);
  });
});

describe("bootstrapDisplay", () => {
  test("calls waitForThemeMode with the given timeout and uses its result", async () => {
    const calls: number[] = [];
    const probe = {
      waitForThemeMode: async (ms: number) => {
        calls.push(ms);
        return "dark" as const;
      },
    };
    const r = await bootstrapDisplay({
      env: { COLORTERM: "truecolor", TERM: "xterm-256color" },
      themeProbe: probe,
      config: undefined,
      themeProbeTimeoutMs: 200,
    });
    expect(calls[0]).toBe(200);
    expect(r.color).toBe("truecolor");
    expect(r.theme).toBe("dark");
  });

  test("falls back to light when waitForThemeMode resolves null", async () => {
    const probe = { waitForThemeMode: async () => null };
    const r = await bootstrapDisplay({
      env: { TERM: "xterm-256color" },
      themeProbe: probe,
      config: undefined,
    });
    expect(r.theme).toBe("light");
  });

  test("falls back to light when waitForThemeMode rejects", async () => {
    const probe = {
      waitForThemeMode: async () => {
        throw new Error("nope");
      },
    };
    const r = await bootstrapDisplay({
      env: { TERM: "xterm-256color" },
      themeProbe: probe,
      config: undefined,
    });
    expect(r.theme).toBe("light");
  });

  test("config.theme override wins over detected theme", async () => {
    const probe = { waitForThemeMode: async () => "dark" as const };
    const r = await bootstrapDisplay({
      env: { COLORTERM: "truecolor" },
      themeProbe: probe,
      config: { theme: "light" },
    });
    expect(r.theme).toBe("light");
  });

  test("default timeout is 200ms when not specified", async () => {
    const calls: number[] = [];
    const probe = {
      waitForThemeMode: async (ms: number) => {
        calls.push(ms);
        return null;
      },
    };
    await bootstrapDisplay({
      env: { TERM: "xterm-256color" },
      themeProbe: probe,
      config: undefined,
    });
    expect(calls[0]).toBe(200);
  });
});

describe("pickLayout", () => {
  test("auto + width 200 → split", () => {
    expect(pickLayout("auto", 200)).toBe("split");
  });

  test("auto + width 100 → stack", () => {
    expect(pickLayout("auto", 100)).toBe("stack");
  });

  test("auto + boundary: 160 → split, 159 → stack", () => {
    expect(pickLayout("auto", 160)).toBe("split");
    expect(pickLayout("auto", 159)).toBe("stack");
  });

  test("forced 'stack' overrides any width", () => {
    expect(pickLayout("stack", 999)).toBe("stack");
  });

  test("forced 'split' overrides narrow width", () => {
    expect(pickLayout("split", 80)).toBe("split");
  });
});
