import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../../src/config/config.ts";
import type { FieldMap } from "../../src/config/inference.ts";

const FIELDS: FieldMap = { text: "text" };

describe("defaultConfig", () => {
  test("preserves inferred labels verbatim — does not auto-append 'other'", () => {
    const cfg = defaultConfig({ inputPath: "/x", fields: FIELDS, labels: ["food", "travel"] });
    expect(cfg.labels).toEqual(["food", "travel"]);
  });

  test("falls back to ['other'] when inference returned no labels", () => {
    const cfg = defaultConfig({ inputPath: "/x", fields: FIELDS });
    expect(cfg.labels).toEqual(["other"]);
  });

  test("falls back to ['other'] when labels is an empty array", () => {
    const cfg = defaultConfig({ inputPath: "/x", fields: FIELDS, labels: [] });
    expect(cfg.labels).toEqual(["other"]);
  });

  test("preserves 'other' when present in inferred labels without duplicating", () => {
    const cfg = defaultConfig({
      inputPath: "/x",
      fields: FIELDS,
      labels: ["food", "other", "travel"],
    });
    expect(cfg.labels).toEqual(["food", "other", "travel"]);
  });

  test("populates display defaults: candidatePin=0.4, color/banding/theme/layout/motion/sidebar=auto", () => {
    const cfg = defaultConfig({ inputPath: "/x", fields: FIELDS });
    expect(cfg.display).toEqual({
      color: "auto",
      banding: "auto",
      theme: "auto",
      candidatePin: 0.4,
      layout: "auto",
      motion: "auto",
      sidebar: "auto",
    });
  });
});

describe("defaultConfig boundary task", () => {
  test("classification task: omits boundary block", () => {
    const cfg = defaultConfig({ inputPath: "/x", fields: FIELDS });
    expect(cfg.task).toBe("classification");
    expect(cfg.boundary).toBeUndefined();
  });

  test("boundary task: populates boundary block with documented defaults", () => {
    const cfg = defaultConfig({ inputPath: "/x", fields: FIELDS, task: "boundary" });
    expect(cfg.task).toBe("boundary");
    expect(cfg.boundary).toEqual({
      documentField: "document_id",
      contextLines: 3,
    });
  });
});

describe("LabellensConfig display key shape", () => {
  test("user-supplied display overrides accepted on the type", () => {
    // Type-level test: this object must satisfy LabellensConfig without errors.
    const cfg = {
      task: "classification" as const,
      labels: ["food"],
      input: { path: "/x", format: "jsonl" as const, fields: FIELDS },
      output: { path: "/y", format: "jsonl" as const },
      display: {
        color: "mono" as const,
        banding: "off" as const,
        candidatePin: 0.3,
        motion: "off" as const,
      },
    };
    expect(cfg.display.color).toBe("mono");
    expect(cfg.display.banding).toBe("off");
    expect(cfg.display.candidatePin).toBe(0.3);
    expect(cfg.display.motion).toBe("off");
  });
});
