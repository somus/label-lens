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
});
