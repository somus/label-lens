import { describe, expect, test } from "bun:test";
import type { Command } from "../../src/actions/command.ts";
import type { PaletteState } from "../../src/overlay/palette.ts";
import { openPalette, reducePalette } from "../../src/overlay/palette.ts";

const noop = async () => {};

const cmds: Command[] = [
  { name: "palette.queue", scope: "global", palette: ":queue", run: noop },
  { name: "palette.by-source", scope: "global", palette: ":by-source", run: noop },
  { name: "palette.open", scope: "global", binding: ":", hidden: true, run: noop },
  { name: "record.accept", scope: "review", binding: "a", run: noop },
];

describe("openPalette", () => {
  test("seeds entries from commands with a palette field, excluding hidden", () => {
    const s = openPalette({ commands: cmds, history: [] });
    const names = s.entries.map((e) => e.commandName);
    expect(names).toEqual(["palette.queue", "palette.by-source"]);
    expect(s.filter).toBe("");
    expect(s.highlight).toBe(0);
    expect(s.historyIdx).toBeNull();
  });

  test("excludes commands with no palette field even if visible", () => {
    const s = openPalette({ commands: cmds, history: [] });
    expect(s.entries.some((e) => e.commandName === "record.accept")).toBe(false);
  });
});

function key(name: string) {
  return { kind: "key" as const, event: { name } };
}

describe("reducePalette filter", () => {
  test("printable keys append to filter and narrow entries by palette prefix", () => {
    let s = openPalette({ commands: cmds, history: [] });
    const r = reducePalette(s, key("b"));
    s = r.overlay!.state as PaletteState;
    expect(s.filter).toBe("b");
    expect(s.entries.map((e) => e.commandName)).toEqual(["palette.by-source"]);
    expect(s.highlight).toBe(0);
  });

  test("filter match is case-insensitive on the palette stem (after leading colon)", () => {
    let s = openPalette({ commands: cmds, history: [] });
    const r = reducePalette(s, key("Q"));
    s = r.overlay!.state as PaletteState;
    expect(s.entries.map((e) => e.commandName)).toEqual(["palette.queue"]);
  });

  test("backspace pops one char and re-widens entries", () => {
    let s = openPalette({ commands: cmds, history: [] });
    s = reducePalette(s, key("b")).overlay!.state as PaletteState;
    s = reducePalette(s, key("backspace")).overlay!.state as PaletteState;
    expect(s.filter).toBe("");
    expect(s.entries.length).toBe(2);
  });

  test("space inside filter is preserved (palette args separator)", () => {
    let s = openPalette({ commands: cmds, history: [] });
    s = reducePalette(s, key("q")).overlay!.state as PaletteState;
    s = reducePalette(s, key("space")).overlay!.state as PaletteState;
    s = reducePalette(s, key("p")).overlay!.state as PaletteState;
    expect(s.filter).toBe("q p");
  });
});

describe("reducePalette navigation", () => {
  test("down increments highlight, clamped at last entry", () => {
    let s = openPalette({ commands: cmds, history: [] });
    for (let i = 0; i < 10; i++) {
      s = reducePalette(s, key("down")).overlay!.state as PaletteState;
    }
    expect(s.highlight).toBe(s.entries.length - 1);
  });

  test("up decrements highlight, clamped at 0", () => {
    let s = openPalette({ commands: cmds, history: [] });
    s = reducePalette(s, key("down")).overlay!.state as PaletteState;
    s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    expect(s.highlight).toBe(0);
  });

  test("up with non-empty filter never enters history mode", () => {
    let s = openPalette({ commands: cmds, history: ["queue pending"] });
    s = reducePalette(s, key("q")).overlay!.state as PaletteState;
    s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    expect(s.historyIdx).toBeNull();
    expect(s.filter).toBe("q");
  });
});

describe("reducePalette history", () => {
  const hist = ["queue pending", "by-source llm", "marked"];

  test("empty-filter up enters history at most-recent entry", () => {
    let s = openPalette({ commands: cmds, history: hist });
    s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    expect(s.historyIdx).toBe(hist.length - 1);
    expect(s.filter).toBe("marked");
  });

  test("subsequent up walks backwards through history", () => {
    let s = openPalette({ commands: cmds, history: hist });
    s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    expect(s.historyIdx).toBe(1);
    expect(s.filter).toBe("by-source llm");
  });

  test("up at oldest history entry stays put", () => {
    let s = openPalette({ commands: cmds, history: hist });
    for (let i = 0; i < 10; i++) {
      s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    }
    expect(s.historyIdx).toBe(0);
    expect(s.filter).toBe("queue pending");
  });

  test("typing while in history mode exits history and treats filter as fresh", () => {
    let s = openPalette({ commands: cmds, history: hist });
    s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    expect(s.filter).toBe("marked");
    s = reducePalette(s, key("x")).overlay!.state as PaletteState;
    expect(s.historyIdx).toBeNull();
    expect(s.filter).toBe("markedx");
  });

  test("empty history with up is a no-op", () => {
    let s = openPalette({ commands: cmds, history: [] });
    s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    expect(s.historyIdx).toBeNull();
    expect(s.filter).toBe("");
  });
});

describe("reducePalette commit", () => {
  test("Enter on highlighted entry emits runCommand + pushPaletteHistory + close", () => {
    let s = openPalette({ commands: cmds, history: [] });
    s = reducePalette(s, key("q")).overlay!.state as PaletteState;
    const r = reducePalette(s, { kind: "commit" });
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([
      { kind: "runCommand", commandName: "palette.queue", argument: undefined },
      { kind: "pushPaletteHistory", entry: "q" },
      { kind: "close" },
    ]);
  });

  test("Enter via key 'return' commits identically", () => {
    let s = openPalette({ commands: cmds, history: [] });
    s = reducePalette(s, key("q")).overlay!.state as PaletteState;
    const r = reducePalette(s, key("return"));
    expect(r.effects.some((e) => e.kind === "runCommand")).toBe(true);
    expect(r.effects.some((e) => e.kind === "close")).toBe(true);
  });

  test("Argument is everything after first space, trimmed", () => {
    let s = openPalette({ commands: cmds, history: [] });
    for (const ch of "queue") {
      s = reducePalette(s, key(ch)).overlay!.state as PaletteState;
    }
    s = reducePalette(s, key("space")).overlay!.state as PaletteState;
    for (const ch of "low-confidence") {
      const k = ch === "-" ? key("-") : key(ch);
      s = reducePalette(s, k).overlay!.state as PaletteState;
    }
    const r = reducePalette(s, { kind: "commit" });
    expect(r.effects[0]).toEqual({
      kind: "runCommand",
      commandName: "palette.queue",
      argument: "low-confidence",
    });
  });

  test("Argument carries colons (by-source llm:gpt-4)", () => {
    let s = openPalette({ commands: cmds, history: [] });
    for (const ch of "by-source") {
      s = reducePalette(s, key(ch)).overlay!.state as PaletteState;
    }
    s = reducePalette(s, key("space")).overlay!.state as PaletteState;
    for (const ch of "llm:gpt-4") {
      s = reducePalette(s, key(ch)).overlay!.state as PaletteState;
    }
    const r = reducePalette(s, { kind: "commit" });
    expect(r.effects[0]).toEqual({
      kind: "runCommand",
      commandName: "palette.by-source",
      argument: "llm:gpt-4",
    });
  });

  test("Commit on empty entries is a no-op (preserves filter)", () => {
    let s = openPalette({ commands: cmds, history: [] });
    s = reducePalette(s, key("z")).overlay!.state as PaletteState;
    expect(s.entries.length).toBe(0);
    const r = reducePalette(s, { kind: "commit" });
    expect(r.overlay?.kind).toBe("palette");
    expect(r.effects).toEqual([]);
  });

  test("Esc emits close and discards state", () => {
    const s = openPalette({ commands: cmds, history: [] });
    const r = reducePalette(s, key("escape"));
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([{ kind: "close" }]);
  });

  test("cancel event closes", () => {
    const s = openPalette({ commands: cmds, history: [] });
    const r = reducePalette(s, { kind: "cancel" });
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([{ kind: "close" }]);
  });
});
