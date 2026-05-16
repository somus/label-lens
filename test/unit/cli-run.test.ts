import { describe, expect, test } from "bun:test";
import { MISSING_CONFIG_MESSAGE, shouldShowMissingConfigSplash } from "../../src/cli/run.ts";

describe("runReview missing-config behavior", () => {
  test("shows splash only when stdin and stdout are TTYs", () => {
    expect(shouldShowMissingConfigSplash({ stdinIsTTY: true, stdoutIsTTY: true })).toBe(true);
    expect(shouldShowMissingConfigSplash({ stdinIsTTY: false, stdoutIsTTY: true })).toBe(false);
    expect(shouldShowMissingConfigSplash({ stdinIsTTY: true, stdoutIsTTY: false })).toBe(false);
    expect(shouldShowMissingConfigSplash({ stdinIsTTY: undefined, stdoutIsTTY: true })).toBe(false);
  });

  test("keeps the non-TTY error guidance actionable", () => {
    expect(MISSING_CONFIG_MESSAGE).toContain("no labellens.config.json");
    expect(MISSING_CONFIG_MESSAGE).toContain("labellens init <file.jsonl>");
  });
});
