import { describe, expect, test } from "bun:test";
import { envVarFor } from "../../src/assistant/env.ts";

describe("envVarFor", () => {
  test("known providers map to pi-ai's canonical env var names", () => {
    expect(envVarFor("anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(envVarFor("openai")).toBe("OPENAI_API_KEY");
    expect(envVarFor("google")).toBe("GEMINI_API_KEY");
    expect(envVarFor("groq")).toBe("GROQ_API_KEY");
  });

  test("unknown provider falls back to <PROVIDER>_API_KEY", () => {
    expect(envVarFor("llama")).toBe("LLAMA_API_KEY");
    expect(envVarFor("cohere")).toBe("COHERE_API_KEY");
  });

  test("fallback is non-empty for any non-empty input", () => {
    expect(envVarFor("x").length).toBeGreaterThan(0);
  });
});
