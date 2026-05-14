import { describe, expect, test } from "bun:test";
import { sep } from "../../src/render/chrome/status-bar.ts";

describe("status-bar sep()", () => {
  test("returns a `│` chip separator with dim tone", () => {
    expect(sep()).toEqual({ text: " │ ", tone: "dim" });
  });
});
