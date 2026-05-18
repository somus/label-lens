import { describe, expect, test } from "bun:test";
import { labelKey } from "../../src/config/config.ts";

describe("labelKey", () => {
  test("returns key from object-form entry", () => {
    expect(labelKey({ name: "food", key: "f" })).toBe("f");
  });

  test("returns null when object-form entry has no key", () => {
    expect(labelKey({ name: "food" })).toBeNull();
  });

  test("returns null for string-form entry", () => {
    expect(labelKey("food")).toBeNull();
  });
});
