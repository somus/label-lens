import { describe, expect, test } from "bun:test";
import {
  buildPromptInput,
  type CanonicalPromptInput,
  canonicalizePrompt,
  hashPrompt,
} from "../../src/assistant/prompt.ts";

const base: CanonicalPromptInput = {
  task: "classification",
  labels: [{ name: "food", definition: "edible" }, { name: "travel" }, { name: "utility" }],
  guidelines: "Pick the most fitting label.",
  candidate_text: "lunch at the cafe",
  context_before: "yesterday",
  context_after: "tomorrow",
  predictions: [
    { label: "food", source: "llm:gpt-4", confidence: 0.91 },
    { label: "travel", source: "regex" },
  ],
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  prompt_template_version: "1.0.0",
};

function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe("canonicalizePrompt", () => {
  test("identical JSON across 10 shuffled-key reorderings of same input", () => {
    const reference = canonicalizePrompt(base);
    for (let i = 0; i < 10; i++) {
      const shuffledLabels = shuffle(base.labels, i + 1);
      const shuffledPreds = shuffle(base.predictions, i + 1);
      const shuffled: CanonicalPromptInput = {
        ...base,
        labels: shuffledLabels,
        predictions: shuffledPreds,
      };
      expect(canonicalizePrompt(shuffled)).toBe(reference);
    }
  });

  test("nested label.definition variant differs from name-only variant", () => {
    const stripped: CanonicalPromptInput = {
      ...base,
      labels: base.labels.map((l) => ({ name: l.name })),
    };
    expect(canonicalizePrompt(stripped)).not.toBe(canonicalizePrompt(base));
  });
});

describe("hashPrompt", () => {
  test("deterministic across invocations", () => {
    const canonical = canonicalizePrompt(base);
    const h1 = hashPrompt(canonical);
    const h2 = hashPrompt(canonical);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  test("differs when provider changes (cache-bust)", () => {
    const a = hashPrompt(canonicalizePrompt({ ...base, provider: "anthropic" }));
    const b = hashPrompt(canonicalizePrompt({ ...base, provider: "openai" }));
    expect(a).not.toBe(b);
  });

  test("differs when model changes (cache-bust)", () => {
    const a = hashPrompt(canonicalizePrompt({ ...base, model: "claude-sonnet-4-5" }));
    const b = hashPrompt(canonicalizePrompt({ ...base, model: "claude-opus-4-7" }));
    expect(a).not.toBe(b);
  });

  test("differs when prompt_template_version changes (cache-bust)", () => {
    const a = hashPrompt(canonicalizePrompt({ ...base, prompt_template_version: "1.0.0" }));
    const b = hashPrompt(canonicalizePrompt({ ...base, prompt_template_version: "2.0.0" }));
    expect(a).not.toBe(b);
  });

  test("identical when only key order of labels/predictions differs", () => {
    const a = hashPrompt(canonicalizePrompt(base));
    const shuffled: CanonicalPromptInput = {
      ...base,
      labels: shuffle(base.labels, 7),
      predictions: shuffle(base.predictions, 13),
    };
    const b = hashPrompt(canonicalizePrompt(shuffled));
    expect(a).toBe(b);
  });
});

describe("buildPromptInput", () => {
  test("populates CanonicalPromptInput from record + config inputs", () => {
    const record = {
      id: "rec-1",
      text: "lunch at the cafe",
      context_before: "yesterday",
      context_after: "tomorrow",
    };
    const input = buildPromptInput({
      record,
      task: "classification",
      labels: [{ name: "food", definition: "edible" }, { name: "travel" }],
      guidelines: "Pick the most fitting label.",
      predictions: [{ label: "food", source: "llm:gpt-4", confidence: 0.91 }],
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      promptTemplateVersion: "1.0.0",
    });
    expect(input.candidate_text).toBe("lunch at the cafe");
    expect(input.task).toBe("classification");
    expect(input.provider).toBe("anthropic");
    expect(input.prompt_template_version).toBe("1.0.0");
  });

  test("strips record extras (no leakage of unrelated fields into hash)", () => {
    const record = {
      id: "rec-1",
      text: "x",
      context_before: null,
      context_after: null,
      // Extra fields that must not appear in the canonical form:
      primaryPrediction: { label: "noise", confidence: 0.01 },
      secret_metadata: "must-not-leak",
    };
    const input = buildPromptInput({
      record: record as Parameters<typeof buildPromptInput>[0]["record"],
      task: "classification",
      labels: [{ name: "x" }],
      guidelines: "",
      predictions: [],
      provider: "ollama",
      model: "llama3",
      promptTemplateVersion: "1.0.0",
    });
    const canonical = canonicalizePrompt(input);
    expect(canonical).not.toContain("secret_metadata");
    expect(canonical).not.toContain("must-not-leak");
    expect(canonical).not.toContain("primaryPrediction");
  });
});
