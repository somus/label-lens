import { describe, expect, test } from "bun:test";
import type { Command } from "../../src/actions/command.ts";
import type { PaletteEntry } from "../../src/overlay/palette.ts";
import { categorize, flattenForNav } from "../../src/overlay/palette-categories.ts";

const noop = async () => {};

const commands: Command[] = [
  {
    name: "palette.marked",
    scope: "global",
    palette: ":marked",
    paletteMetadata: { category: "queues" },
    run: noop,
  },
  {
    name: "palette.by-source",
    scope: "global",
    palette: ":by-source",
    paletteMetadata: { category: "filters", arity: 1, pickerKind: "source" },
    run: noop,
  },
  {
    name: "palette.by-label",
    scope: "global",
    palette: ":by-label",
    paletteMetadata: { category: "filters", arity: 1, pickerKind: "label" },
    run: noop,
  },
  {
    name: "palette.guidelines",
    scope: "global",
    palette: ":guidelines",
    paletteMetadata: { category: "help" },
    run: noop,
  },
  {
    name: "palette.help",
    scope: "global",
    palette: ":help",
    paletteMetadata: { category: "help" },
    run: noop,
  },
  { name: "palette.export", scope: "global", palette: ":export", run: noop },
];

const entries: PaletteEntry[] = commands
  .filter((c) => c.palette)
  .map((c) => ({ commandName: c.name, palette: c.palette! }));

describe("categorize", () => {
  test("groups entries by paletteMetadata.category", () => {
    const groups = categorize(entries, commands);
    const ids = groups.map((g) => g.id);
    expect(ids).toEqual(["queues", "filters", "actions", "help"]);
  });

  test("commands without category default to actions", () => {
    const groups = categorize(entries, commands);
    const actions = groups.find((g) => g.id === "actions")!;
    expect(actions.entries.some((e) => e.commandName === "palette.export")).toBe(true);
  });

  test("empty categories are omitted", () => {
    const queueOnly = entries.filter((e) => e.commandName === "palette.marked");
    const groups = categorize(queueOnly, commands);
    expect(groups.length).toBe(1);
    expect(groups[0]!.id).toBe("queues");
  });

  test("category labels match expected display names", () => {
    const groups = categorize(entries, commands);
    const labels = groups.map((g) => g.label);
    expect(labels).toEqual(["Queues", "Filters", "Actions", "Help"]);
  });

  test("attaches a Unicode icon per category for capability-aware rendering", () => {
    const groups = categorize(entries, commands);
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    expect(byId.queues?.icon).toBe("⊞");
    expect(byId.filters?.icon).toBe("◇");
    expect(byId.actions?.icon).toBe("▸");
    expect(byId.help?.icon).toBe("?");
  });
});

describe("flattenForNav", () => {
  test("returns one NavItem per entry (no headers)", () => {
    const groups = categorize(entries, commands);
    const nav = flattenForNav(groups);
    expect(nav.length).toBe(entries.length);
    expect(nav.every((n) => n.kind === "entry")).toBe(true);
  });

  test("preserves category order: queues first, help last", () => {
    const groups = categorize(entries, commands);
    const nav = flattenForNav(groups);
    expect(nav[0]!.categoryId).toBe("queues");
    expect(nav[nav.length - 1]!.categoryId).toBe("help");
  });
});
