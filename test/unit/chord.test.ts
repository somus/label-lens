import { describe, expect, test } from "bun:test";
import { createChordResolver } from "../../src/keymap/chord.ts";
import type { Binding } from "../../src/keymap/engine.ts";

const BINDINGS: Binding[] = [
  { key: "g d", action: "record.show-doc", scope: "review" },
  { key: "g g", action: "doc.top", scope: "doc-view" },
  { key: "j", action: "record.next", scope: "review" },
];

describe("createChordResolver", () => {
  test("two-key chord resolves on second key within window", () => {
    const r = createChordResolver(BINDINGS, { windowMs: 200, now: () => 0 });
    expect(r.feed("review", { name: "g" }, 0)).toBeNull();
    expect(r.feed("review", { name: "d" }, 50)).toBe("record.show-doc");
  });

  test("chord buffer expires after window", () => {
    const r = createChordResolver(BINDINGS, { windowMs: 200 });
    expect(r.feed("review", { name: "g" }, 0)).toBeNull();
    expect(r.feed("review", { name: "d" }, 250)).toBeNull();
  });

  test("non-chord key resolves single-key binding immediately", () => {
    const r = createChordResolver(BINDINGS, { windowMs: 200 });
    expect(r.feed("review", { name: "j" }, 0)).toBe("record.next");
  });

  test("unrelated second key resets buffer (no spurious match) and resolves itself", () => {
    const r = createChordResolver(BINDINGS, { windowMs: 200 });
    r.feed("review", { name: "g" }, 0);
    expect(r.feed("review", { name: "j" }, 10)).toBe("record.next");
  });

  test("scope filters chord candidates", () => {
    const r = createChordResolver(BINDINGS, { windowMs: 200 });
    r.feed("doc-view", { name: "g" }, 0);
    expect(r.feed("doc-view", { name: "d" }, 50)).toBeNull();
    expect(r.feed("doc-view", { name: "g" }, 60)).toBeNull();
    expect(r.feed("doc-view", { name: "g" }, 70)).toBe("doc.top");
  });
});
