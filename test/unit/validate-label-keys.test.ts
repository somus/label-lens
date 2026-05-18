import { describe, expect, test } from "bun:test";
import type { LabellensConfig } from "../../src/config/config.ts";
import { validateLabelKeys } from "../../src/config/config.ts";

function cfg(labels: LabellensConfig["labels"]): LabellensConfig {
  return {
    task: "classification",
    labels,
    input: { path: "x.jsonl", format: "jsonl", fields: { text: "text" } },
    output: { path: "y.jsonl", format: "jsonl" },
  };
}

describe("validateLabelKeys", () => {
  test("flags collision with reserved single-char binding", () => {
    const err = validateLabelKeys(cfg([{ name: "approved", key: "a" }]), new Set(["a", "g"]));
    expect(err).toContain("'a'");
    expect(err).toContain("approved");
  });

  test("flags collision with chord starter", () => {
    const err = validateLabelKeys(cfg([{ name: "good", key: "g" }]), new Set(["a", "g"]));
    expect(err).toContain("'g'");
    expect(err).toContain("good");
  });

  test("flags duplicate key across two labels", () => {
    const err = validateLabelKeys(
      cfg([
        { name: "food", key: "f" },
        { name: "friendly", key: "f" },
      ]),
      new Set(),
    );
    expect(err).toContain("food");
    expect(err).toContain("friendly");
    expect(err).toContain("'f'");
  });

  test("aggregates multiple violations into one message", () => {
    const err = validateLabelKeys(
      cfg([
        { name: "approved", key: "a" },
        { name: "food", key: "f" },
        { name: "friendly", key: "f" },
      ]),
      new Set(["a"]),
    );
    expect(err).toContain("approved");
    expect(err).toContain("food");
    expect(err).toContain("friendly");
  });

  test("returns null for valid config", () => {
    const err = validateLabelKeys(
      cfg([{ name: "food", key: "f" }, { name: "utility", key: "u" }, "travel"]),
      new Set(["a", "x", "s"]),
    );
    expect(err).toBeNull();
  });

  test("ignores entries without a key", () => {
    const err = validateLabelKeys(cfg([{ name: "food" }, "travel"]), new Set(["a"]));
    expect(err).toBeNull();
  });
});
