import { describe, expect, test } from "bun:test";
import { ALL_COMMANDS } from "../../src/actions/registry.ts";
import { resolve as resolveKey } from "../../src/keymap/engine.ts";
import { resolvePreset } from "../../src/keymap/preset.ts";

function resolvedBindings(keys?: import("../../src/keymap/preset.ts").KeysConfig) {
  const { commands, errors } = resolvePreset(ALL_COMMANDS, keys);
  expect(errors).toEqual([]);
  return commands.flatMap((c) => {
    const list = Array.isArray(c.binding) ? c.binding : c.binding ? [c.binding] : [];
    return list.map((key) => ({ key, action: c.name, scope: c.scope }));
  });
}

describe("preset → keymap dispatch", () => {
  test("simple preset binds 'down' to record.next; 'j' is inert in review", () => {
    const bindings = resolvedBindings({ preset: "simple" });
    expect(resolveKey(bindings, "review", { name: "down" })).toBe("record.next");
    expect(resolveKey(bindings, "review", { name: "j" })).toBeNull();
  });

  test("vim preset keeps 'j' bound to record.next", () => {
    const bindings = resolvedBindings({ preset: "vim" });
    expect(resolveKey(bindings, "review", { name: "j" })).toBe("record.next");
  });

  test("simple preset binds ctrl+p to palette.open; ':' is inert", () => {
    const bindings = resolvedBindings({ preset: "simple" });
    expect(resolveKey(bindings, "review", { name: "p", ctrl: true })).toBe("palette.open");
    expect(resolveKey(bindings, "review", { name: ":" })).toBeNull();
  });

  test("keys.overrides on top of simple preset reassigns the binding", () => {
    const bindings = resolvedBindings({
      preset: "simple",
      overrides: { "record.accept": "y" },
    });
    expect(resolveKey(bindings, "review", { name: "y" })).toBe("record.accept");
    expect(resolveKey(bindings, "review", { name: "a" })).toBeNull();
  });

  test("missing keys config resolves to simple (arrow-key default)", () => {
    const bindings = resolvedBindings(undefined);
    expect(resolveKey(bindings, "review", { name: "down" })).toBe("record.next");
  });

  test("simple preset rebinds queue cycling to arrow keys", () => {
    const bindings = resolvedBindings({ preset: "simple" });
    expect(resolveKey(bindings, "review", { name: "right" })).toBe("queue.next");
    expect(resolveKey(bindings, "review", { name: "left" })).toBe("queue.prev");
    expect(resolveKey(bindings, "review", { name: "]" })).toBeNull();
    expect(resolveKey(bindings, "review", { name: "[" })).toBeNull();
  });
});
