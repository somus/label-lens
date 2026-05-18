import { describe, expect, test } from "bun:test";
import {
  CONFIGURE_PROVIDERS,
  openConfigureAssistant,
  reduceConfigureAssistant,
} from "../../src/overlay/configure-assistant.ts";
import type { ConfigureAssistantState, ReduceResult } from "../../src/overlay/types.ts";

function press(state: ConfigureAssistantState, name: string): ReduceResult {
  return reduceConfigureAssistant(state, { kind: "key", event: { name } });
}

function state(r: ReduceResult): ConfigureAssistantState {
  if (!r.overlay || r.overlay.kind !== "configure-assistant") {
    throw new Error("expected configure-assistant overlay");
  }
  return r.overlay.state;
}

describe("openConfigureAssistant", () => {
  test("starts on provider step with no error", () => {
    const s = openConfigureAssistant();
    expect(s.step).toBe("provider");
    expect(s.error).toBeUndefined();
  });
});

describe("provider step", () => {
  test("digit selects provider, return advances to auth", () => {
    let s = openConfigureAssistant();
    s = state(press(s, "1"));
    expect(s.selectedProvider).toBe(CONFIGURE_PROVIDERS[0]!.slug);
    s = state(press(s, "return"));
    expect(s.step).toBe("auth");
  });

  test("return without selection flashes error", () => {
    const s = openConfigureAssistant();
    const r = press(s, "return");
    expect(state(r).step).toBe("provider");
    expect(state(r).error).toContain("1-9");
  });

  test("out-of-range digit ignored", () => {
    const s = openConfigureAssistant();
    const r = press(s, "9");
    if (CONFIGURE_PROVIDERS.length < 9) {
      expect(state(r).selectedProvider).toBeUndefined();
    } else {
      expect(state(r).selectedProvider).toBe(CONFIGURE_PROVIDERS[8]!.slug);
    }
  });

  test("escape closes the overlay", () => {
    const s = openConfigureAssistant();
    const r = press(s, "escape");
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([{ kind: "close" }]);
  });
});

describe("auth step (remote provider)", () => {
  function authStart(): ConfigureAssistantState {
    let s = openConfigureAssistant();
    s = state(press(s, "1")); // anthropic
    s = state(press(s, "return"));
    return s;
  }

  test("keystrokes append to apiKey", () => {
    let s = authStart();
    s = state(press(s, "s"));
    s = state(press(s, "k"));
    s = state(press(s, "-"));
    expect(s.apiKey).toBe("sk-");
  });

  test("backspace pops one char", () => {
    let s = authStart();
    s = state(press(s, "a"));
    s = state(press(s, "b"));
    s = state(press(s, "backspace"));
    expect(s.apiKey).toBe("a");
  });

  test("return with empty field flashes error", () => {
    const s = authStart();
    const r = press(s, "return");
    expect(state(r).step).toBe("auth");
    expect(state(r).error).toBeDefined();
  });

  test("return with non-empty advances to privacy", () => {
    let s = authStart();
    s = state(press(s, "x"));
    s = state(press(s, "return"));
    expect(s.step).toBe("privacy");
  });
});

describe("auth step (ollama)", () => {
  function ollamaStart(): ConfigureAssistantState {
    let s = openConfigureAssistant();
    const ollamaIdx = CONFIGURE_PROVIDERS.findIndex((p) => p.slug === "ollama");
    expect(ollamaIdx).toBeGreaterThanOrEqual(0);
    s = state(press(s, String(ollamaIdx + 1)));
    s = state(press(s, "return"));
    return s;
  }

  test("URL typed into ollamaUrl, not apiKey", () => {
    let s = ollamaStart();
    s = state(press(s, "h"));
    s = state(press(s, "t"));
    expect(s.ollamaUrl).toBe("ht");
    expect(s.apiKey).toBeUndefined();
  });

  test("return advances directly to commit (skips privacy)", () => {
    let s = ollamaStart();
    s = state(press(s, "x"));
    const r = press(s, "return");
    // commit step → reducer immediately emits updateAssistantConfig + close.
    expect(r.overlay).toBeNull();
    const effects = r.effects;
    const cfg = effects.find((e) => e.kind === "updateAssistantConfig");
    expect(cfg).toBeDefined();
    if (cfg?.kind === "updateAssistantConfig") {
      expect(cfg.assistant.enabled).toBe(true);
      expect(cfg.assistant.provider).toBe("ollama");
      expect(cfg.assistant.privacyAcknowledged).toBe(true);
      expect(cfg.assistant.ollamaUrl).toBe("x");
      expect(cfg.assistant.apiKeyEnvVar).toBeUndefined();
    }
    expect(effects[effects.length - 1]).toEqual({ kind: "close" });
  });
});

describe("privacy step", () => {
  function privacyStart(): ConfigureAssistantState {
    let s = openConfigureAssistant();
    s = state(press(s, "1")); // anthropic (remote)
    s = state(press(s, "return"));
    s = state(press(s, "k"));
    s = state(press(s, "return"));
    expect(s.step).toBe("privacy");
    return s;
  }

  test("y commits updateAssistantConfig with privacyAcknowledged: true", () => {
    const s = privacyStart();
    const r = press(s, "y");
    expect(r.overlay).toBeNull();
    const cfg = r.effects.find((e) => e.kind === "updateAssistantConfig");
    expect(cfg).toBeDefined();
    if (cfg?.kind === "updateAssistantConfig") {
      expect(cfg.assistant.enabled).toBe(true);
      expect(cfg.assistant.provider).toBe("anthropic");
      expect(cfg.assistant.privacyAcknowledged).toBe(true);
      expect(cfg.assistant.apiKeyEnvVar).toBe("ANTHROPIC_API_KEY");
    }
  });

  test("return also commits", () => {
    const s = privacyStart();
    const r = press(s, "return");
    expect(r.overlay).toBeNull();
    expect(r.effects.some((e) => e.kind === "updateAssistantConfig")).toBe(true);
  });

  test("n closes without committing", () => {
    const s = privacyStart();
    const r = press(s, "n");
    expect(r.overlay).toBeNull();
    expect(r.effects.some((e) => e.kind === "updateAssistantConfig")).toBe(false);
    expect(r.effects).toEqual([{ kind: "close" }]);
  });
});

describe("stream events ignored", () => {
  test("streamToken on any step keeps state", () => {
    const s = openConfigureAssistant();
    const r = reduceConfigureAssistant(s, { kind: "streamToken", token: "x" });
    expect(state(r)).toEqual(s);
  });
});
