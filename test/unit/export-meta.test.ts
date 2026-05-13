import { describe, expect, test } from "bun:test";
import { projectMeta } from "../../src/export/meta.ts";

describe("projectMeta", () => {
  test("returns undefined when no extra fields remain", () => {
    const raw = JSON.stringify({
      text: "hello",
      prediction: "food",
      confidence: 0.9,
      source: "llm:gpt-4",
    });
    expect(projectMeta(raw)).toBeUndefined();
  });

  test("returns extra fields verbatim", () => {
    const raw = JSON.stringify({
      text: "hello",
      prediction: "food",
      user_id: "u-1",
      category_hint: "restaurant",
      nested: { score: 0.42 },
    });
    expect(projectMeta(raw)).toEqual({
      user_id: "u-1",
      category_hint: "restaurant",
      nested: { score: 0.42 },
    });
  });

  test("strips id, context_*, predictions[], issues[], reason, label", () => {
    const raw = JSON.stringify({
      id: "abc",
      text: "x",
      context_before: "before",
      context_after: "after",
      predictions: [{ label: "a" }],
      prediction: "a",
      confidence: 0.5,
      source: "s",
      reason: "low_conf",
      issues: [{ type: "label_issue" }],
      label: "a",
      keep_me: true,
    });
    expect(projectMeta(raw)).toEqual({ keep_me: true });
  });

  test("returns input.meta verbatim when input has a top-level meta object", () => {
    const raw = JSON.stringify({
      text: "x",
      prediction: "p",
      meta: { document_id: "doc-1", nested: { extra: 1 } },
    });
    expect(projectMeta(raw)).toEqual({ document_id: "doc-1", nested: { extra: 1 } });
  });

  test("prefers input.meta over stranded extras when both exist", () => {
    const raw = JSON.stringify({
      text: "x",
      meta: { canonical: true },
      stranded_extra: "ignored",
    });
    expect(projectMeta(raw)).toEqual({ canonical: true });
  });

  test("treats non-object input.meta as a stripped key (falls back to extras)", () => {
    const raw = JSON.stringify({ text: "x", meta: "scalar", user_id: "u-1" });
    expect(projectMeta(raw)).toEqual({ user_id: "u-1" });
  });

  test("returns undefined when raw is not a JSON object", () => {
    expect(projectMeta("not-json")).toBeUndefined();
    expect(projectMeta("[1,2,3]")).toBeUndefined();
    expect(projectMeta("42")).toBeUndefined();
  });
});
