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
    const bad: Record<string, unknown> = { ...makeValid(), task: "span-tagging" };
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
      keys: { preset: "vim", overrides: { "record.accept": "y" } },
    });
    expect(validateConfigSchema(cfg)).toEqual([]);
  });

  test("accepts nested signals.lowConfidence.default", () => {
    const cfg = makeValid({
      signals: { lowConfidence: { default: 0.7 } },
    });
    expect(validateConfigSchema(cfg)).toEqual([]);
  });

  test("accepts nested signals.lowConfidence.bySource overrides", () => {
    const cfg = makeValid({
      signals: {
        lowConfidence: {
          default: 0.5,
          bySource: { "regex.*": 0.3, "llm:gpt-4": 0.6 },
        },
      },
    });
    expect(validateConfigSchema(cfg)).toEqual([]);
  });

  test("rejects signals.lowConfidence.default of 0 (exclusive lower bound)", () => {
    const bad = makeValid({ signals: { lowConfidence: { default: 0 } } });
    const errors = validateConfigSchema(bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("accepts signals.lowConfidence.default of 1 (inclusive upper bound)", () => {
    const cfg = makeValid({ signals: { lowConfidence: { default: 1 } } });
    expect(validateConfigSchema(cfg)).toEqual([]);
  });

  test("rejects signals.lowConfidence.default above 1", () => {
    const bad = makeValid({ signals: { lowConfidence: { default: 1.1 } } });
    const errors = validateConfigSchema(bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("rejects bySource override of 0 (exclusive lower bound)", () => {
    const bad = makeValid({
      signals: { lowConfidence: { default: 0.5, bySource: { "regex.*": 0 } } },
    });
    const errors = validateConfigSchema(bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("rejects unknown signal kind", () => {
    const bad = makeValid({
      signals: { enable: ["lowConfidence", "magic-vibes"] as unknown as never },
    });
    const errors = validateConfigSchema(bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("rejects empty csvMultiLabelSeparator (minLength 1)", () => {
    const bad = makeValid({
      output: { path: "./out.jsonl", format: "jsonl", csvMultiLabelSeparator: "" },
    });
    const errors = validateConfigSchema(bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join("\n")).toMatch(/csvMultiLabelSeparator|minLength/);
  });

  test("rejects flat keys.<command> shape (legacy pre-preset configs)", () => {
    const bad = makeValid({ keys: { "record.accept": "y" } as unknown as never });
    const errors = validateConfigSchema(bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("accepts chord and modifier strings under keys.overrides", () => {
    const cfg = makeValid({
      keys: { overrides: { "record.accept": "ctrl+y", "record.show-doc": "g x" } },
    });
    expect(validateConfigSchema(cfg)).toEqual([]);
  });

  test("accepts array bindings under keys.overrides", () => {
    const cfg = makeValid({
      keys: { overrides: { "record.next": ["j", "down"] } },
    });
    expect(validateConfigSchema(cfg)).toEqual([]);
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

  test("accepts navigation.rerankInterval and navigation.rerankColdStart", () => {
    const cfg = makeValid({ navigation: { rerankInterval: 25, rerankColdStart: 50 } });
    expect(validateConfigSchema(cfg)).toEqual([]);
  });

  test("rejects navigation.rerankInterval below 1", () => {
    const bad = makeValid({ navigation: { rerankInterval: 0 } });
    const errors = validateConfigSchema(bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("rejects navigation.rerankColdStart below 0", () => {
    const bad = makeValid({ navigation: { rerankColdStart: -1 } });
    const errors = validateConfigSchema(bad);
    expect(errors.length).toBeGreaterThan(0);
  });
});
