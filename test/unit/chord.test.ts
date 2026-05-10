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

  test("pending chord beats a global single-key binding on the second key", () => {
    const r = createChordResolver(
      [
        { key: "g q", action: "doc.bottom", scope: "review" },
        { key: "q", action: "app.quit", scope: "global" },
      ],
      { windowMs: 200 },
    );
    expect(r.feed("review", { name: "g" }, 0)).toBeNull();
    expect(r.feed("review", { name: "q" }, 50)).toBe("doc.bottom");
  });

  test("shift+g passes through to single-key resolver even when 'g g' chord exists", () => {
    const r = createChordResolver(
      [
        { key: "g g", action: "doc.top", scope: "doc-view" },
        { key: "shift+g", action: "doc.bottom", scope: "doc-view" },
      ],
      { windowMs: 200 },
    );
    // Pressing G (shift+g) must NOT enter the 'g g' chord buffer.
    expect(r.feed("doc-view", { name: "g", shift: true }, 0)).toBe("doc.bottom");
  });

  test("plain 'g' still enters the chord buffer when 'g g' chord exists", () => {
    const r = createChordResolver(
      [
        { key: "g g", action: "doc.top", scope: "doc-view" },
        { key: "shift+g", action: "doc.bottom", scope: "doc-view" },
      ],
      { windowMs: 200 },
    );
    expect(r.feed("doc-view", { name: "g" }, 0)).toBeNull();
    expect(r.feed("doc-view", { name: "g" }, 50)).toBe("doc.top");
  });

  test("reset() drops pending first-key buffer", () => {
    const r = createChordResolver(BINDINGS, { windowMs: 200 });
    r.feed("review", { name: "g" }, 0);
    r.reset();
    // Without reset, the next 'd' would resolve to record.show-doc.
    expect(r.feed("review", { name: "d" }, 50)).toBeNull();
  });
});
