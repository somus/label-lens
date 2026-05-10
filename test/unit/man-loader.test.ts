import { describe, expect, test } from "bun:test";
import { loadManPage, manPageTopics } from "../../src/man/loader.ts";

describe("man-loader", () => {
  test("returns embedded markdown for known topics", () => {
    expect(loadManPage("keymap")).toContain("labellens-keymap");
    expect(loadManPage("config")).toContain("labellens-config");
    expect(loadManPage("tutorial")).toContain("labellens-tutorial");
    expect(loadManPage("assistant")).toContain("labellens-assistant");
  });

  test("returns null for unknown topics", () => {
    expect(loadManPage("nope")).toBeNull();
  });

  test("manPageTopics lists all four built-in topics", () => {
    expect(manPageTopics().sort()).toEqual(["assistant", "config", "keymap", "tutorial"]);
  });
});
