import { describe, expect, test } from "bun:test";
import {
  CONFIG_SCHEMA_URL,
  defaultConfig,
  type LabellensConfig,
  validateConfigSchema,
} from "../../src/config/config.ts";
import type { FieldMap } from "../../src/config/inference.ts";

const FIELDS: FieldMap = { text: "text" };

function makeValid(overrides: Partial<LabellensConfig> = {}): LabellensConfig {
  return {
    ...defaultConfig({ inputPath: "/x.jsonl", fields: FIELDS, labels: ["food"] }),
    ...overrides,
  };
}

describe("validateConfigSchema", () => {
  test("accepts a default-shaped config", () => {
    const errors = validateConfigSchema(makeValid());
    expect(errors).toEqual([]);
  });

  test("rejects missing required `task`", () => {
    const bad: Record<string, unknown> = { ...makeValid() };
    delete bad.task;
    const errors = validateConfigSchema(bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join("\n")).toContain("required");
  });

  test("rejects malformed `candidatePin` (above 0.95 max)", () => {
    const bad = makeValid({ display: { candidatePin: 1.5 } });
    const errors = validateConfigSchema(bad);
    expect(errors.join("\n")).toMatch(/candidatePin/);
  });

  test("rejects unknown `task` value", () => {
    const bad: Record<string, unknown> = { ...makeValid(), task: "multi-label" };
    const errors = validateConfigSchema(bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("accepts optional signals + assistant blocks", () => {
    const cfg = makeValid({
      assistant: {
        enabled: true,
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        systemPromptAppend: "Domain rule X",
      },
      signals: { lowConfidenceThreshold: 0.7, enable: ["lowConfidence", "duplicate"] },
      output: {
        path: "./out.jsonl",
        format: "jsonl",
        includeRejected: true,
        csvMultiLabelSeparator: "|",
        fieldOverrides: { label: "category" },
      },
      notes: { presets: ["needs-help", "ambiguous"] },
      keys: { "record.accept": "y" },
    });
    expect(validateConfigSchema(cfg)).toEqual([]);
  });

  test("rejects unknown signal kind", () => {
    const bad = makeValid({
      signals: { enable: ["lowConfidence", "magic-vibes"] as unknown as never },
    });
    const errors = validateConfigSchema(bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("rejects label.key longer than one character", () => {
    const bad = makeValid({ labels: [{ name: "food", key: "fd" }] });
    const errors = validateConfigSchema(bad);
    expect(errors.join("\n")).toMatch(/key/);
  });

  test("defaultConfig writes $schema pointing at the published URL", () => {
    const cfg = defaultConfig({ inputPath: "/x", fields: FIELDS });
    expect(cfg.$schema).toBe(CONFIG_SCHEMA_URL);
  });
});
