import { describe, expect, test } from "bun:test";
import { filterLabels } from "../../src/picker/filter.ts";

const LABELS = ["food", "travel", "utility", "other", "transport", "fashion"];

describe("filterLabels", () => {
  test("empty query returns all labels in original order", () => {
    expect(filterLabels(LABELS, "")).toEqual([
      "food",
      "travel",
      "utility",
      "other",
      "transport",
      "fashion",
    ]);
  });

  test("substring filters case-insensitively", () => {
    expect(filterLabels(LABELS, "TR")).toEqual(["travel", "transport"]);
  });

  test("prefix matches rank above non-prefix", () => {
    expect(filterLabels(LABELS, "f")).toEqual(["food", "fashion"]);
  });

  test("returns empty array on no match", () => {
    expect(filterLabels(LABELS, "zzz")).toEqual([]);
  });

  test("ranks prefix above mid-word match", () => {
    expect(filterLabels(["other", "transport", "tooth"], "t")).toEqual([
      "transport",
      "tooth",
      "other",
    ]);
  });

  test("matches non-ASCII labels case-insensitively", () => {
    expect(filterLabels(["Café", "Düsseldorf", "日本語"], "café")).toEqual(["Café"]);
    expect(filterLabels(["Café", "Düsseldorf", "日本語"], "DÜS")).toEqual(["Düsseldorf"]);
    expect(filterLabels(["Café", "Düsseldorf", "日本語"], "日本")).toEqual(["日本語"]);
  });
});
