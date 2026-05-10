import { describe, expect, test } from "bun:test";
import type { Command } from "../../src/actions/command.ts";
import type { HelpState } from "../../src/overlay/help.ts";
import { openHelp, reduceHelp } from "../../src/overlay/help.ts";

const noop = async () => {};

const cmds: Command[] = [
  { name: "record.accept", scope: "review", binding: "a", run: noop },
  { name: "record.reject", scope: "review", binding: "x", run: noop },
  { name: "record.next", scope: "review", binding: "j", run: noop },
  { name: "queue.next", scope: "review", binding: "]", run: noop },
  { name: "doc.top", scope: "doc-view", binding: "g g", run: noop },
  { name: "palette.queue", scope: "global", palette: ":queue", run: noop },
  { name: "palette.open", scope: "global", binding: ":", hidden: true, run: noop },
  { name: "secret.thing", scope: "review", binding: "ctrl+x", hidden: true, run: noop },
];

describe("openHelp", () => {
  test("includes review-scope and global commands; excludes other scopes and hidden", () => {
    const s = openHelp({ commands: cmds, scope: "review" });
    const names = s.entries.map((e) => e.name);
    expect(names).toContain("record.accept");
    expect(names).toContain("queue.next");
    expect(names).toContain("palette.queue");
    expect(names).not.toContain("doc.top");
    expect(names).not.toContain("palette.open");
    expect(names).not.toContain("secret.thing");
    expect(s.scroll).toBe(0);
    expect(s.scope).toBe("review");
  });

  test("groups entries by category derived from action-name prefix", () => {
    const s = openHelp({ commands: cmds, scope: "review" });
    const cats = new Set(s.entries.map((e) => e.category));
    expect(cats.has("record")).toBe(true);
    expect(cats.has("queue")).toBe(true);
    expect(cats.has("palette")).toBe(true);
  });

  test("entries are sorted: category first, then bound-before-palette-only, then by name", () => {
    const s = openHelp({ commands: cmds, scope: "review" });
    const recordEntries = s.entries.filter((e) => e.category === "record");
    expect(recordEntries.map((e) => e.name)).toEqual([
      "record.accept",
      "record.next",
      "record.reject",
    ]);
  });

  test("commands with multiple bindings appear once with all bindings shown", () => {
    const multi: Command = {
      name: "record.skip",
      scope: "review",
      binding: ["s", "S"],
      run: noop,
    };
    const s = openHelp({ commands: [multi], scope: "review" });
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]!.binding).toBe("s, S");
  });

  test("palette-only commands list a placeholder in the binding column", () => {
    const s = openHelp({ commands: cmds, scope: "review" });
    const paletteOnly = s.entries.find((e) => e.name === "palette.queue");
    expect(paletteOnly?.binding).toBe("—");
    expect(paletteOnly?.palette).toBe(":queue");
  });
});

function key(name: string) {
  return { kind: "key" as const, event: { name } };
}

describe("reduceHelp", () => {
  test("Down increments scroll, Up decrements, clamped at 0", () => {
    let s = openHelp({ commands: cmds, scope: "review" });
    s = reduceHelp(s, key("down")).overlay!.state as HelpState;
    expect(s.scroll).toBe(1);
    s = reduceHelp(s, key("up")).overlay!.state as HelpState;
    s = reduceHelp(s, key("up")).overlay!.state as HelpState;
    expect(s.scroll).toBe(0);
  });

  test("Esc closes the overlay", () => {
    const s = openHelp({ commands: cmds, scope: "review" });
    const r = reduceHelp(s, key("escape"));
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([{ kind: "close" }]);
  });

  test("cancel event closes", () => {
    const s = openHelp({ commands: cmds, scope: "review" });
    const r = reduceHelp(s, { kind: "cancel" });
    expect(r.overlay).toBeNull();
  });

  test("? toggles the overlay closed (same key as opener)", () => {
    const s = openHelp({ commands: cmds, scope: "review" });
    const r = reduceHelp(s, key("?"));
    expect(r.overlay).toBeNull();
  });
});
