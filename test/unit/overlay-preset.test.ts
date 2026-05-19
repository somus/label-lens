import { describe, expect, test } from "bun:test";
import {
  isOverlayNext,
  isOverlayPrev,
  isOverlayRowNext,
  isOverlayRowPrev,
} from "../../src/overlay/key-match.ts";

describe("overlay key match against preset", () => {
  test("simple preset accepts arrow keys only", () => {
    expect(isOverlayNext({ name: "down" }, "simple")).toBe(true);
    expect(isOverlayNext({ name: "j" }, "simple")).toBe(false);
    expect(isOverlayPrev({ name: "up" }, "simple")).toBe(true);
    expect(isOverlayPrev({ name: "k" }, "simple")).toBe(false);
  });

  test("vim preset accepts j/k aliases alongside arrows", () => {
    expect(isOverlayNext({ name: "down" }, "vim")).toBe(true);
    expect(isOverlayNext({ name: "j" }, "vim")).toBe(true);
    expect(isOverlayPrev({ name: "up" }, "vim")).toBe(true);
    expect(isOverlayPrev({ name: "k" }, "vim")).toBe(true);
  });

  test("default (no preset arg) behaves like vim — preserves legacy reducer tests", () => {
    expect(isOverlayNext({ name: "j" })).toBe(true);
    expect(isOverlayPrev({ name: "k" })).toBe(true);
  });

  test("ctrl+j/k in vim move filter-builder rows; ctrl+arrows in simple do the same", () => {
    expect(isOverlayRowNext({ name: "j", ctrl: true }, "vim")).toBe(true);
    expect(isOverlayRowNext({ name: "j", ctrl: true }, "simple")).toBe(false);
    expect(isOverlayRowNext({ name: "down", ctrl: true }, "simple")).toBe(true);
    expect(isOverlayRowPrev({ name: "k", ctrl: true }, "vim")).toBe(true);
    expect(isOverlayRowPrev({ name: "up", ctrl: true }, "simple")).toBe(true);
  });

  test("modified j without ctrl/meta still navigates in vim", () => {
    expect(isOverlayNext({ name: "j", shift: true }, "vim")).toBe(true);
  });

  test("ctrl+j is not overlay-next (reserved for row move)", () => {
    expect(isOverlayNext({ name: "j", ctrl: true }, "vim")).toBe(false);
  });
});
