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
    const s = openPalette({ commands: cmds, history: [], scope: "review" });
    const names = s.entries.map((e) => e.commandName);
    expect(names).toEqual(["palette.queue", "palette.by-source"]);
    expect(s.filter).toBe("");
    expect(s.highlight).toBe(0);
    expect(s.historyIdx).toBeNull();
  });

  test("excludes commands with no palette field even if visible", () => {
    const s = openPalette({ commands: cmds, history: [], scope: "review" });
    expect(s.entries.some((e) => e.commandName === "record.accept")).toBe(false);
  });

  test("filters out commands whose scope doesn't match (excluding global)", () => {
    const mixed: Command[] = [
      { name: "g.cmd", scope: "global", palette: ":g", run: noop },
      { name: "r.cmd", scope: "review", palette: ":r", run: noop },
      { name: "d.cmd", scope: "doc-view", palette: ":d", run: noop },
    ];
    const review = openPalette({ commands: mixed, history: [], scope: "review" });
    expect(review.entries.map((e) => e.commandName).sort()).toEqual(["g.cmd", "r.cmd"]);
    const doc = openPalette({ commands: mixed, history: [], scope: "doc-view" });
    expect(doc.entries.map((e) => e.commandName).sort()).toEqual(["d.cmd", "g.cmd"]);
  });
});

describe("reducePalette accepts where-expression characters", () => {
  test("=, <, >, !, ', (, ), comma, % are typed into the filter", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    for (const ch of "where:source = 'llm:gpt-4', confidence < 0.3 (a)") {
      s = reducePalette(s, key(ch)).overlay!.state as PaletteState;
    }
    expect(s.filter).toBe("where:source = 'llm:gpt-4', confidence < 0.3 (a)");
  });
});

function key(name: string) {
  return { kind: "key" as const, event: { name } };
}

describe("reducePalette filter", () => {
  test("printable keys append to filter and narrow entries by palette prefix", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    const r = reducePalette(s, key("b"));
    s = r.overlay!.state as PaletteState;
    expect(s.filter).toBe("b");
    expect(s.entries.map((e) => e.commandName)).toEqual(["palette.by-source"]);
    expect(s.highlight).toBe(0);
  });

  test("filter match is case-insensitive on the palette stem (after leading colon)", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    const r = reducePalette(s, key("Q"));
    s = r.overlay!.state as PaletteState;
    expect(s.entries.map((e) => e.commandName)).toEqual(["palette.queue"]);
  });

  test("backspace pops one char and re-widens entries", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    s = reducePalette(s, key("b")).overlay!.state as PaletteState;
    s = reducePalette(s, key("backspace")).overlay!.state as PaletteState;
    expect(s.filter).toBe("");
    expect(s.entries.length).toBe(2);
  });

  test("space inside filter is preserved (palette args separator)", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    s = reducePalette(s, key("q")).overlay!.state as PaletteState;
    s = reducePalette(s, key("space")).overlay!.state as PaletteState;
    s = reducePalette(s, key("p")).overlay!.state as PaletteState;
    expect(s.filter).toBe("q p");
  });
});

describe("reducePalette navigation", () => {
  test("down increments highlight, clamped at last entry", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    for (let i = 0; i < 10; i++) {
      s = reducePalette(s, key("down")).overlay!.state as PaletteState;
    }
    expect(s.highlight).toBe(s.entries.length - 1);
  });

  test("up decrements highlight, clamped at 0", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    s = reducePalette(s, key("down")).overlay!.state as PaletteState;
    s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    expect(s.highlight).toBe(0);
  });

  test("up with non-empty filter still navigates highlight, not history", () => {
    let s = openPalette({ commands: cmds, history: ["queue pending"], scope: "review" });
    s = reducePalette(s, key("q")).overlay!.state as PaletteState;
    s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    expect(s.historyIdx).toBeNull();
    expect(s.filter).toBe("q");
  });

  test("up at empty filter does NOT enter history (history is ctrl+p only)", () => {
    let s = openPalette({ commands: cmds, history: ["marked", "queue pending"], scope: "review" });
    s = reducePalette(s, key("up")).overlay!.state as PaletteState;
    expect(s.historyIdx).toBeNull();
    expect(s.filter).toBe("");
  });
});

function ctrlKey(name: string) {
  return { kind: "key" as const, event: { name, ctrl: true } };
}

describe("reducePalette history (ctrl+p / ctrl+n)", () => {
  const hist = ["queue pending", "by-source llm", "marked"];

  test("ctrl+p at empty filter enters history at most-recent entry", () => {
    let s = openPalette({ commands: cmds, history: hist, scope: "review" });
    s = reducePalette(s, ctrlKey("p")).overlay!.state as PaletteState;
    expect(s.historyIdx).toBe(hist.length - 1);
    expect(s.filter).toBe("marked");
  });

  test("subsequent ctrl+p walks backwards through history", () => {
    let s = openPalette({ commands: cmds, history: hist, scope: "review" });
    s = reducePalette(s, ctrlKey("p")).overlay!.state as PaletteState;
    s = reducePalette(s, ctrlKey("p")).overlay!.state as PaletteState;
    expect(s.historyIdx).toBe(1);
    expect(s.filter).toBe("by-source llm");
  });

  test("ctrl+p at oldest history entry stays put", () => {
    let s = openPalette({ commands: cmds, history: hist, scope: "review" });
    for (let i = 0; i < 10; i++) {
      s = reducePalette(s, ctrlKey("p")).overlay!.state as PaletteState;
    }
    expect(s.historyIdx).toBe(0);
    expect(s.filter).toBe("queue pending");
  });

  test("ctrl+n past newest exits history mode and clears filter", () => {
    let s = openPalette({ commands: cmds, history: hist, scope: "review" });
    s = reducePalette(s, ctrlKey("p")).overlay!.state as PaletteState;
    expect(s.filter).toBe("marked");
    s = reducePalette(s, ctrlKey("n")).overlay!.state as PaletteState;
    expect(s.historyIdx).toBeNull();
    expect(s.filter).toBe("");
  });

  test("typing while in history mode exits history and treats filter as fresh", () => {
    let s = openPalette({ commands: cmds, history: hist, scope: "review" });
    s = reducePalette(s, ctrlKey("p")).overlay!.state as PaletteState;
    expect(s.filter).toBe("marked");
    s = reducePalette(s, key("x")).overlay!.state as PaletteState;
    expect(s.historyIdx).toBeNull();
    expect(s.filter).toBe("markedx");
  });

  test("ctrl+p with empty history is a no-op", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    s = reducePalette(s, ctrlKey("p")).overlay!.state as PaletteState;
    expect(s.historyIdx).toBeNull();
    expect(s.filter).toBe("");
  });
});

describe("reducePalette commit", () => {
  test("Enter on highlighted entry emits runCommand + pushPaletteHistory + close", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    s = reducePalette(s, key("q")).overlay!.state as PaletteState;
    const r = reducePalette(s, { kind: "commit" });
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([
      { kind: "close" },
      { kind: "pushPaletteHistory", entry: "q" },
      { kind: "runCommand", commandName: "palette.queue", argument: undefined },
    ]);
  });

  test("Enter via key 'return' commits identically", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    s = reducePalette(s, key("q")).overlay!.state as PaletteState;
    const r = reducePalette(s, key("return"));
    expect(r.effects.some((e) => e.kind === "runCommand")).toBe(true);
    expect(r.effects.some((e) => e.kind === "close")).toBe(true);
  });

  test("Argument is everything after first space, trimmed", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    for (const ch of "queue") {
      s = reducePalette(s, key(ch)).overlay!.state as PaletteState;
    }
    s = reducePalette(s, key("space")).overlay!.state as PaletteState;
    for (const ch of "low-confidence") {
      const k = ch === "-" ? key("-") : key(ch);
      s = reducePalette(s, k).overlay!.state as PaletteState;
    }
    const r = reducePalette(s, { kind: "commit" });
    const runCmd = r.effects.find((e) => e.kind === "runCommand");
    expect(runCmd).toEqual({
      kind: "runCommand",
      commandName: "palette.queue",
      argument: "low-confidence",
    });
  });

  test("Argument carries colons (by-source llm:gpt-4)", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    for (const ch of "by-source") {
      s = reducePalette(s, key(ch)).overlay!.state as PaletteState;
    }
    s = reducePalette(s, key("space")).overlay!.state as PaletteState;
    for (const ch of "llm:gpt-4") {
      s = reducePalette(s, key(ch)).overlay!.state as PaletteState;
    }
    const r = reducePalette(s, { kind: "commit" });
    const runCmd = r.effects.find((e) => e.kind === "runCommand");
    expect(runCmd).toEqual({
      kind: "runCommand",
      commandName: "palette.by-source",
      argument: "llm:gpt-4",
    });
  });

  test("Commit on empty entries is a no-op (preserves filter)", () => {
    let s = openPalette({ commands: cmds, history: [], scope: "review" });
    s = reducePalette(s, key("z")).overlay!.state as PaletteState;
    expect(s.entries.length).toBe(0);
    const r = reducePalette(s, { kind: "commit" });
    expect(r.overlay?.kind).toBe("palette");
    expect(r.effects).toEqual([]);
  });

  test("Esc emits close and discards state", () => {
    const s = openPalette({ commands: cmds, history: [], scope: "review" });
    const r = reducePalette(s, key("escape"));
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([{ kind: "close" }]);
  });

  test("cancel event closes", () => {
    const s = openPalette({ commands: cmds, history: [], scope: "review" });
    const r = reducePalette(s, { kind: "cancel" });
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([{ kind: "close" }]);
  });
});
