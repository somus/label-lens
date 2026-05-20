import { expect, test } from "bun:test";
import {
  openMultiLabelPicker,
  reduceMultiLabelPicker,
} from "../../src/overlay/multi-label-picker.ts";

const allLabels = [{ name: "spam", key: "s" }, { name: "toxicity" }, { name: "promotion" }];

function open(predicted: string[]) {
  return openMultiLabelPicker({
    recordId: "rec-1",
    allLabels,
    predicted,
    predictedConfidence: 0.9,
  });
}

test("opens with selected mirroring predicted set", () => {
  const s = open(["spam", "toxicity"]);
  expect(s.selected).toEqual(["spam", "toxicity"]);
  expect(s.candidates.find((c) => c.label === "spam")?.predicted).toBe(true);
  expect(s.candidates.find((c) => c.label === "spam")?.selected).toBe(true);
  expect(s.candidates.find((c) => c.label === "promotion")?.selected).toBe(false);
});

test("space toggles highlighted label", () => {
  let s = open(["spam"]);
  s = (
    reduceMultiLabelPicker(s, {
      kind: "key",
      event: { name: "space" },
    }).overlay as { state: typeof s }
  ).state;
  // spam was selected and highlighted at index 0 → now unselected
  expect(s.selected).toEqual([]);
  s = (
    reduceMultiLabelPicker(s, {
      kind: "key",
      event: { name: "space" },
    }).overlay as { state: typeof s }
  ).state;
  expect(s.selected).toEqual(["spam"]);
});

test("enter on empty selected refuses commit", () => {
  let s = open(["spam"]);
  s = (
    reduceMultiLabelPicker(s, {
      kind: "key",
      event: { name: "space" },
    }).overlay as { state: typeof s }
  ).state;
  const r = reduceMultiLabelPicker(s, { kind: "commit" });
  expect(r.overlay).not.toBeNull();
  expect(r.effects.some((e) => e.kind === "commitDecision")).toBe(false);
  expect(r.effects.some((e) => e.kind === "close")).toBe(false);
});

test("enter with selected == predicted commits status accepted", () => {
  const s = open(["spam", "toxicity"]);
  const r = reduceMultiLabelPicker(s, { kind: "commit" });
  const commit = r.effects.find((e) => e.kind === "commitDecision");
  expect(commit).toEqual({
    kind: "commitDecision",
    recordId: "rec-1",
    status: "accepted",
    finalLabel: '["spam","toxicity"]',
    prevLabel: null,
    sourceOfTruth: "human",
  });
  expect(r.overlay).toBeNull();
});

test("enter with selected != predicted commits status relabeled and encodes prev set", () => {
  let s = open(["spam"]);
  // Toggle promotion in (highlight 0=spam → press down twice to promotion idx 2)
  s = (
    reduceMultiLabelPicker(s, {
      kind: "key",
      event: { name: "down" },
    }).overlay as { state: typeof s }
  ).state;
  s = (
    reduceMultiLabelPicker(s, {
      kind: "key",
      event: { name: "down" },
    }).overlay as { state: typeof s }
  ).state;
  s = (
    reduceMultiLabelPicker(s, {
      kind: "key",
      event: { name: "space" },
    }).overlay as { state: typeof s }
  ).state;
  expect(s.selected).toEqual(["spam", "promotion"]);
  const r = reduceMultiLabelPicker(s, { kind: "commit" });
  const commit = r.effects.find((e) => e.kind === "commitDecision");
  expect(commit).toMatchObject({
    status: "relabeled",
    finalLabel: '["spam","promotion"]',
    prevLabel: '["spam"]',
  });
});

test("escape closes without committing", () => {
  const s = open(["spam"]);
  const r = reduceMultiLabelPicker(s, {
    kind: "key",
    event: { name: "escape" },
  });
  expect(r.overlay).toBeNull();
  expect(r.effects).toEqual([{ kind: "close" }]);
});

test("configured per-label key toggles that label (does not commit)", () => {
  const s = open([]);
  const r = reduceMultiLabelPicker(s, {
    kind: "key",
    event: { name: "s" },
  });
  const next = (r.overlay as { state: typeof s }).state;
  expect(next.selected).toEqual(["spam"]);
  expect(r.effects).toEqual([]);
});
