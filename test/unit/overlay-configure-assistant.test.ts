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

  test("env var name matches pi-ai convention per provider", () => {
    const cases: { providerSlug: string; expected: string }[] = [
      { providerSlug: "anthropic", expected: "ANTHROPIC_API_KEY" },
      { providerSlug: "openai", expected: "OPENAI_API_KEY" },
      // Google's pi-ai env var is GEMINI_API_KEY, not GOOGLE_API_KEY.
      { providerSlug: "google", expected: "GEMINI_API_KEY" },
      { providerSlug: "groq", expected: "GROQ_API_KEY" },
    ];
    for (const c of cases) {
      const idx = CONFIGURE_PROVIDERS.findIndex((p) => p.slug === c.providerSlug);
      expect(idx).toBeGreaterThanOrEqual(0);
      let s = openConfigureAssistant();
      s = state(press(s, String(idx + 1)));
      s = state(press(s, "return"));
      s = state(press(s, "k"));
      s = state(press(s, "return"));
      const r = press(s, "y");
      const cfg = r.effects.find((e) => e.kind === "updateAssistantConfig");
      if (cfg?.kind === "updateAssistantConfig") {
        expect(cfg.assistant.apiKeyEnvVar).toBe(c.expected);
      } else {
        throw new Error(`no updateAssistantConfig for ${c.providerSlug}`);
      }
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

describe("config drift", () => {
  test("opens fresh on provider step even when caller previously configured an unknown provider", () => {
    // Reviewer hand-edits config.assistant.provider to a slug not in
    // CONFIGURE_PROVIDERS (e.g. a future custom integration). The configure
    // overlay re-opens via the same `openConfigureAssistant()` factory and
    // always starts at the provider step so they can pick from the supported
    // list without seeing a half-broken auth screen.
    const s = openConfigureAssistant();
    expect(s.step).toBe("provider");
    expect(s.selectedProvider).toBeUndefined();
    // Reviewer picks a supported provider; subsequent digit press still works.
    const r = press(s, "1");
    expect(state(r).selectedProvider).toBe(CONFIGURE_PROVIDERS[0]!.slug);
  });
});

describe("stream events ignored", () => {
  test("streamToken on any step keeps state", () => {
    const s = openConfigureAssistant();
    const r = reduceConfigureAssistant(s, { kind: "streamToken", token: "x" });
    expect(state(r)).toEqual(s);
  });
});

describe("paste handling (auth step)", () => {
  function authStart(provider = "1"): ConfigureAssistantState {
    let s = openConfigureAssistant();
    s = state(press(s, provider));
    s = state(press(s, "return"));
    return s;
  }

  test("pasted text appends to apiKey for remote provider", () => {
    const s = authStart("1");
    const r = reduceConfigureAssistant(s, { kind: "paste", text: "sk-ant-api03-abc123" });
    expect(state(r).apiKey).toBe("sk-ant-api03-abc123");
  });

  test("pasted text appends to ollamaUrl for ollama provider", () => {
    const ollamaIdx = CONFIGURE_PROVIDERS.findIndex((p) => p.slug === "ollama");
    const s = authStart(String(ollamaIdx + 1));
    const r = reduceConfigureAssistant(s, { kind: "paste", text: "http://localhost:11434" });
    expect(state(r).ollamaUrl).toBe("http://localhost:11434");
  });

  test("control chars stripped from paste payload (bracketed-paste residue)", () => {
    const s = authStart("1");
    const r = reduceConfigureAssistant(s, { kind: "paste", text: "abc\x1b[200~def\x07ghi" });
    // ESC, the trailing control chars, and the bell are gone; alphanumerics survive.
    expect(state(r).apiKey).toContain("abc");
    expect(state(r).apiKey).toContain("def");
    expect(state(r).apiKey).toContain("ghi");
    expect(state(r).apiKey).not.toContain("\x1b");
    expect(state(r).apiKey).not.toContain("\x07");
  });

  test("newlines collapse to spaces (multi-line clipboard)", () => {
    const s = authStart("1");
    const r = reduceConfigureAssistant(s, { kind: "paste", text: "line1\nline2\r\nline3" });
    expect(state(r).apiKey).toBe("line1 line2 line3");
  });

  test("paste in provider step is a no-op", () => {
    const s = openConfigureAssistant();
    const r = reduceConfigureAssistant(s, { kind: "paste", text: "ignored" });
    expect(state(r)).toEqual(s);
  });
});
