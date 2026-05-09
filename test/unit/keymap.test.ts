import { describe, expect, test } from "bun:test";
import { type Binding, resolve } from "../../src/keymap/engine.ts";

const bindings: Binding[] = [
  { key: "a", action: "record.accept", scope: "review" },
  { key: "j", action: "record.next", scope: "review" },
  { key: "ctrl+c", action: "app.quit", scope: "global" },
  { key: "shift+enter", action: "record.relabel", scope: "review" },
];

describe("keymap engine", () => {
  test("matches a plain letter in the right scope", () => {
    expect(resolve(bindings, "review", { name: "a" })).toBe("record.accept");
  });

  test("returns null when scope mismatches", () => {
    expect(resolve(bindings, "stats", { name: "a" })).toBeNull();
  });

  test("global scope matches from any scope", () => {
    expect(resolve(bindings, "review", { name: "c", ctrl: true })).toBe("app.quit");
  });

  test("modifier mismatches do not match", () => {
    expect(resolve(bindings, "review", { name: "a", ctrl: true })).toBeNull();
  });

  test("shift+enter resolves with both modifiers correct", () => {
    expect(resolve(bindings, "review", { name: "enter", shift: true })).toBe("record.relabel");
  });

  test("first matching binding wins", () => {
    const dupe: Binding[] = [
      { key: "a", action: "record.accept", scope: "review" },
      { key: "a", action: "record.something_else", scope: "review" },
    ];
    expect(resolve(dupe, "review", { name: "a" })).toBe("record.accept");
  });
});
