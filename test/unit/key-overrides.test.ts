import { describe, expect, test } from "bun:test";
import { applyKeyOverrides, type Command } from "../../src/actions/command.ts";

function cmd(name: string, binding: string): Command {
  return {
    name,
    scope: "review",
    binding,
    run: () => {},
  };
}

describe("applyKeyOverrides", () => {
  const commands = [cmd("record.accept", "a"), cmd("record.reject", "x"), cmd("record.skip", "s")];

  test("returns input commands untouched when overrides is empty", () => {
    const result = applyKeyOverrides(commands, undefined, new Set());
    expect(result.errors).toEqual([]);
    expect(result.commands).toBe(commands);
  });

  test("swaps the binding for a known command", () => {
    const reserved = new Set(["x", "s"]); // accept's `a` excluded since it's being overridden
    const result = applyKeyOverrides(commands, { "record.accept": "y" }, reserved);
    expect(result.errors).toEqual([]);
    const accept = result.commands.find((c) => c.name === "record.accept");
    expect(accept?.binding).toBe("y");
  });

  test("errors when override targets an unknown command", () => {
    const result = applyKeyOverrides(commands, { "record.unknown": "y" }, new Set());
    expect(result.errors[0]).toContain("no command with that name");
  });

  test("errors when override key collides with reserved set", () => {
    const reserved = new Set(["x", "s"]);
    const result = applyKeyOverrides(commands, { "record.accept": "x" }, reserved);
    expect(result.errors[0]).toContain("reserved");
  });

  test("errors when two overrides claim the same key", () => {
    const reserved = new Set<string>();
    const result = applyKeyOverrides(
      commands,
      { "record.accept": "y", "record.reject": "y" },
      reserved,
    );
    expect(result.errors.some((e) => e.includes("also assigned"))).toBe(true);
  });

  test("rejects empty-string override key", () => {
    const result = applyKeyOverrides(commands, { "record.accept": "" }, new Set());
    expect(result.errors[0]).toContain("must not be empty");
  });
});
