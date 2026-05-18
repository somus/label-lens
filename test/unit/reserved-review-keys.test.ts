import { describe, expect, test } from "bun:test";
import type { Command } from "../../src/actions/command.ts";
import { ALL_COMMANDS, reservedReviewKeys } from "../../src/actions/registry.ts";

describe("reservedReviewKeys", () => {
  test("includes single-char review-scope bindings from real registry", () => {
    const reserved = reservedReviewKeys(ALL_COMMANDS);
    for (const k of ["a", "x", "s", "r", "j", "k", "m", "u", "n"]) {
      expect(reserved.has(k)).toBe(true);
    }
  });

  test("includes digit-accelerator bindings 1-9", () => {
    const reserved = reservedReviewKeys(ALL_COMMANDS);
    for (const k of ["1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
      expect(reserved.has(k)).toBe(true);
    }
  });

  test("includes global-scope quit binding q", () => {
    const reserved = reservedReviewKeys(ALL_COMMANDS);
    expect(reserved.has("q")).toBe(true);
  });

  test("includes chord starter g from multi-token bindings", () => {
    const fakeChord: Command = {
      name: "test.chord",
      scope: "review",
      binding: "g d",
      run: () => undefined,
    };
    const reserved = reservedReviewKeys([fakeChord]);
    expect(reserved.has("g")).toBe(true);
    expect(reserved.has("d")).toBe(false);
  });

  test("ignores stats/queue/picker scopes (label keys are review-scope)", () => {
    const offScope: Command = {
      name: "stats.foo",
      scope: "stats",
      binding: "f",
      run: () => undefined,
    };
    const reserved = reservedReviewKeys([offScope]);
    expect(reserved.has("f")).toBe(false);
  });

  test("handles string[] bindings", () => {
    const multi: Command = {
      name: "test.multi",
      scope: "review",
      binding: ["a", "b"],
      run: () => undefined,
    };
    const reserved = reservedReviewKeys([multi]);
    expect(reserved.has("a")).toBe(true);
    expect(reserved.has("b")).toBe(true);
  });
});
