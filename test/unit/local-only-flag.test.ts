import { describe, expect, test } from "bun:test";
import type { LabellensConfig } from "../../src/config/config.ts";
import { validateLocalOnly } from "../../src/config/config.ts";

function cfg(assistant?: LabellensConfig["assistant"]): LabellensConfig {
  return {
    task: "classification",
    labels: ["x"],
    input: { path: "x.jsonl", format: "jsonl", fields: { text: "text" } },
    output: { path: "y.jsonl", format: "jsonl" },
    assistant,
  };
}

describe("validateLocalOnly", () => {
  test("returns null when flag not set", () => {
    expect(validateLocalOnly(cfg({ enabled: true, provider: "anthropic" }), false)).toBeNull();
  });

  test("returns null when flag set but no assistant config", () => {
    expect(validateLocalOnly(cfg(), true)).toBeNull();
  });

  test("returns null when flag set with ollama provider", () => {
    expect(validateLocalOnly(cfg({ enabled: true, provider: "ollama" }), true)).toBeNull();
  });

  test("returns error mentioning provider name when flag set with remote provider", () => {
    const err = validateLocalOnly(cfg({ enabled: true, provider: "anthropic" }), true);
    expect(err).toContain("--local-only");
    expect(err).toContain("anthropic");
  });

  test("returns error for openai provider too", () => {
    const err = validateLocalOnly(cfg({ enabled: true, provider: "openai" }), true);
    expect(err).toContain("openai");
  });
});
