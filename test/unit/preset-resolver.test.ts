import { describe, expect, test } from "bun:test";
import type { Command } from "../../src/actions/command.ts";
import { resolvePreset } from "../../src/keymap/preset.ts";

const noop = () => {};

function next(): Command {
  return {
    name: "record.next",
    scope: "review",
    bindings: { vim: "j", simple: "down" },
    run: noop,
  };
}

function prev(): Command {
  return {
    name: "record.prev",
    scope: "review",
    bindings: { vim: "k", simple: "up" },
    run: noop,
  };
}

function accept(): Command {
  return {
    name: "record.accept",
    scope: "review",
    bindings: { vim: "a" },
    run: noop,
  };
}

describe("resolvePreset", () => {
  test("missing keys config resolves to the simple preset", () => {
    const result = resolvePreset([next()], undefined);
    expect(result.errors).toEqual([]);
    expect(result.commands[0]?.binding).toBe("down");
  });

  test("preset 'vim' resolves the vim binding", () => {
    const result = resolvePreset([next()], { preset: "vim" });
    expect(result.errors).toEqual([]);
    expect(result.commands[0]?.binding).toBe("j");
  });

  test("simple preset falls back to vim when no simple is declared", () => {
    const result = resolvePreset([accept()], { preset: "simple" });
    expect(result.errors).toEqual([]);
    expect(result.commands[0]?.binding).toBe("a");
  });

  test("unknown preset name returns an error", () => {
    const result = resolvePreset([next()], { preset: "dvorak" });
    expect(result.errors[0]).toContain("unknown preset");
    expect(result.errors[0]).toContain("dvorak");
  });

  test("overrides replace the resolved binding", () => {
    const result = resolvePreset([accept()], {
      preset: "vim",
      overrides: { "record.accept": "y" },
    });
    expect(result.errors).toEqual([]);
    expect(result.commands[0]?.binding).toBe("y");
  });

  test("override array preserves all bindings", () => {
    const result = resolvePreset([next()], {
      preset: "vim",
      overrides: { "record.next": ["j", "down"] },
    });
    expect(result.errors).toEqual([]);
    expect(result.commands[0]?.binding).toEqual(["j", "down"]);
  });

  test("override accepts modifier and chord strings", () => {
    const result = resolvePreset([accept()], {
      preset: "vim",
      overrides: { "record.accept": "ctrl+y" },
    });
    expect(result.errors).toEqual([]);
    expect(result.commands[0]?.binding).toBe("ctrl+y");
  });

  test("malformed binding string is rejected", () => {
    const result = resolvePreset([accept()], {
      preset: "vim",
      overrides: { "record.accept": "" },
    });
    expect(result.errors.join("\n")).toContain("record.accept");
  });

  test("unknown command in overrides is rejected", () => {
    const result = resolvePreset([accept()], {
      preset: "vim",
      overrides: { "record.bogus": "y" },
    });
    expect(result.errors.join("\n")).toContain("record.bogus");
  });

  test("collision between two commands in the same scope is rejected", () => {
    const result = resolvePreset([next(), prev()], {
      preset: "vim",
      overrides: { "record.prev": "j" },
    });
    expect(result.errors.join("\n")).toContain("j");
    expect(result.errors.join("\n")).toMatch(/record\.next|record\.prev/);
  });

  test("custom preset inherits from vim baseline", () => {
    const result = resolvePreset([accept(), next()], {
      preset: "dvorak",
      presets: { dvorak: { "record.accept": ";" } },
    });
    expect(result.errors).toEqual([]);
    const byName = new Map(result.commands.map((c) => [c.name, c.binding]));
    expect(byName.get("record.accept")).toBe(";");
    expect(byName.get("record.next")).toBe("j");
  });

  test("overrides apply on top of custom preset", () => {
    const result = resolvePreset([accept()], {
      preset: "dvorak",
      presets: { dvorak: { "record.accept": ";" } },
      overrides: { "record.accept": "y" },
    });
    expect(result.errors).toEqual([]);
    expect(result.commands[0]?.binding).toBe("y");
  });
});
