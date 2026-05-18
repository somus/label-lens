import { describe, expect, test } from "bun:test";
import {
  defaultConfig,
  type LabellensConfig,
  validateFieldOverrides,
} from "../../src/config/config.ts";
import type { FieldMap } from "../../src/config/inference.ts";

const FIELDS: FieldMap = { text: "text" };

function makeValid(output: LabellensConfig["output"]): LabellensConfig {
  return { ...defaultConfig({ inputPath: "/x", fields: FIELDS, labels: ["food"] }), output };
}

describe("validateFieldOverrides", () => {
  test("accepts absent overrides", () => {
    const cfg = makeValid({ path: "./out.jsonl", format: "jsonl" });
    expect(validateFieldOverrides(cfg)).toBeNull();
  });

  test("accepts distinct overrides", () => {
    const cfg = makeValid({
      path: "./out.jsonl",
      format: "jsonl",
      fieldOverrides: { label: "category", reviewed_at: "ts" },
    });
    expect(validateFieldOverrides(cfg)).toBeNull();
  });

  test("rejects two overrides that map to the same emitted name", () => {
    const cfg = makeValid({
      path: "./out.jsonl",
      format: "jsonl",
      fieldOverrides: { id: "record", text: "record" },
    });
    expect(validateFieldOverrides(cfg)).toMatch(/both map to 'record'/);
  });

  test("rejects override that collides with a non-overridden default name", () => {
    const cfg = makeValid({
      path: "./out.jsonl",
      format: "jsonl",
      fieldOverrides: { text: "id" },
    });
    expect(validateFieldOverrides(cfg)).toMatch(/map to 'id'/);
  });
});
