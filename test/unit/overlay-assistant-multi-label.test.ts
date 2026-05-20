import { expect, test } from "bun:test";
import type { AssistantMultiLabelResponse } from "../../src/assistant/schema.ts";
import { openAssistant, reduceAssistant } from "../../src/overlay/assistant.ts";

const CONFIGURED = ["spam", "toxicity", "promotion"];

function multiLabelDone(suggested: string[]): AssistantMultiLabelResponse {
  return {
    suggestedLabels: suggested,
    confidence: "high",
    reasoning: "set",
    evidenceFor: [],
    evidenceAgainst: [],
    recommendedAction: "relabel",
  };
}

test("multi-label streamEnd→commit emits commitDecision with encoded set + human+assistant", () => {
  const s0 = openAssistant("rec-1", null, {
    multiLabel: { configuredLabels: CONFIGURED, predicted: ["spam"] },
  });
  const r0 = reduceAssistant(s0, {
    kind: "streamEnd",
    response: multiLabelDone(["toxicity", "spam"]),
  });
  const s1 = (r0.overlay as { state: typeof s0 }).state;
  const r1 = reduceAssistant(s1, { kind: "commit" });
  expect(r1.effects).toContainEqual({
    kind: "commitDecision",
    recordId: "rec-1",
    status: "relabeled",
    finalLabel: '["spam","toxicity"]',
    prevLabel: '["spam"]',
    sourceOfTruth: "human+assistant",
  });
});

test("multi-label streamEnd with set equal to predicted commits status accepted", () => {
  const s0 = openAssistant("rec-1", null, {
    multiLabel: { configuredLabels: CONFIGURED, predicted: ["spam", "toxicity"] },
  });
  const r0 = reduceAssistant(s0, {
    kind: "streamEnd",
    response: { ...multiLabelDone(["toxicity", "spam"]), recommendedAction: "accept" },
  });
  const s1 = (r0.overlay as { state: typeof s0 }).state;
  const r1 = reduceAssistant(s1, { kind: "commit" });
  expect(r1.effects).toContainEqual({
    kind: "commitDecision",
    recordId: "rec-1",
    status: "accepted",
    finalLabel: '["spam","toxicity"]',
    prevLabel: null,
    sourceOfTruth: "human+assistant",
  });
});

test("multi-label streamEnd with empty normalised set refuses commit", () => {
  const s0 = openAssistant("rec-1", null, {
    multiLabel: { configuredLabels: CONFIGURED, predicted: ["spam"] },
  });
  const r0 = reduceAssistant(s0, {
    kind: "streamEnd",
    response: multiLabelDone(["bogus-only"]),
  });
  const s1 = (r0.overlay as { state: typeof s0 }).state;
  const r1 = reduceAssistant(s1, { kind: "commit" });
  expect(r1.effects.some((e) => e.kind === "commitDecision")).toBe(false);
});

test("multi-label empty set + recommendedAction=accept keeps overlay packed", () => {
  // Guard at src/overlay/assistant.ts:129-131: empty suggestionSet under an
  // accept/relabel action must NOT emit a commitDecision with finalLabel='[]'.
  const s0 = openAssistant("rec-1", null, {
    multiLabel: { configuredLabels: CONFIGURED, predicted: ["spam"] },
  });
  const r0 = reduceAssistant(s0, {
    kind: "streamEnd",
    response: { ...multiLabelDone([]), recommendedAction: "accept" },
  });
  const s1 = (r0.overlay as { state: typeof s0 }).state;
  const r1 = reduceAssistant(s1, { kind: "commit" });
  expect(r1.overlay).not.toBeNull();
  expect(r1.effects.some((e) => e.kind === "commitDecision")).toBe(false);
});

test("multi-label empty set + recommendedAction=reject still commits a reject", () => {
  // Reject path runs BEFORE the empty-set bailout — an empty suggestion is a
  // valid reject (rejected reviews carry final_label=null, prev=encoded
  // predicted set). Regression-guards the ordering of checks in commitMultiLabel.
  const s0 = openAssistant("rec-1", null, {
    multiLabel: { configuredLabels: CONFIGURED, predicted: ["spam"] },
  });
  const r0 = reduceAssistant(s0, {
    kind: "streamEnd",
    response: { ...multiLabelDone([]), recommendedAction: "reject" },
  });
  const s1 = (r0.overlay as { state: typeof s0 }).state;
  const r1 = reduceAssistant(s1, { kind: "commit" });
  expect(r1.effects).toContainEqual({
    kind: "commitDecision",
    recordId: "rec-1",
    status: "rejected",
    finalLabel: null,
    prevLabel: '["spam"]',
    sourceOfTruth: "human+assistant",
  });
});
