import { describe, expect, test } from "bun:test";
import { canonicalizePrompt, hashPrompt } from "../../src/assistant/prompt.ts";
import { buildAssistantPrompt } from "../../src/assistant/prompt-template.ts";

const base = {
  task: "classification",
  labels: [{ name: "food" }],
  guidelines: "",
  candidate_text: "menu item",
  context_before: null,
  context_after: null,
  predictions: [],
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  prompt_template_version: "1.0.0",
};

describe("systemPromptAppend", () => {
  test("buildAssistantPrompt appends the project rules section", () => {
    const parts = buildAssistantPrompt({
      ...base,
      system_prompt_append: "Treat trailing whitespace as significant.",
    });
    expect(parts.systemPrompt).toContain("## Project rules");
    expect(parts.systemPrompt).toContain("Treat trailing whitespace as significant.");
  });

  test("absent or empty append leaves the system prompt unchanged", () => {
    const without = buildAssistantPrompt(base);
    const empty = buildAssistantPrompt({ ...base, system_prompt_append: "" });
    expect(without.systemPrompt).toBe(empty.systemPrompt);
    expect(without.systemPrompt).not.toContain("## Project rules");
  });

  test("hash differs when system_prompt_append changes", () => {
    const a = hashPrompt(canonicalizePrompt({ ...base, system_prompt_append: "Rule A" }));
    const b = hashPrompt(canonicalizePrompt({ ...base, system_prompt_append: "Rule B" }));
    const baseline = hashPrompt(canonicalizePrompt(base));
    expect(a).not.toBe(b);
    expect(a).not.toBe(baseline);
  });

  test("hash with empty append matches hash with no append (cache reuses)", () => {
    const empty = hashPrompt(canonicalizePrompt({ ...base, system_prompt_append: "" }));
    const baseline = hashPrompt(canonicalizePrompt(base));
    expect(empty).toBe(baseline);
  });
});
