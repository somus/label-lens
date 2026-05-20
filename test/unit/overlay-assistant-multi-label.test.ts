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

test("single-label task: response with stray suggestedLabels is rejected, not misrouted", () => {
  // Regression guard: TypeBox Type.Object is open by default, so a
  // single-label response could carry an extra `suggestedLabels` key. The
  // reducer must gate on the overlay's task mode (state.multiLabel), NOT on
  // response shape, to avoid committing finalLabel="" via the multi-label
  // branch with no state.multiLabel set.
  const s0 = openAssistant("rec-1", "spam");
  // No options.multiLabel → state.multiLabel undefined (single-label task).
  const malformed = {
    suggestedLabel: "spam",
    suggestedLabels: ["spam", "toxicity"],
    confidence: "high",
    reasoning: "x",
    evidenceFor: [],
    evidenceAgainst: [],
    recommendedAction: "accept",
  } as unknown as AssistantMultiLabelResponse;
  const r0 = reduceAssistant(s0, { kind: "streamEnd", response: malformed });
  const s1 = (r0.overlay as { state: typeof s0 }).state;
  // Should land in done state with suggestion = "spam" (single-label path),
  // NOT in done with empty suggestion via the multi-label branch.
  expect(s1.status).toBe("done");
  if (s1.status === "done") {
    expect(s1.suggestion).toBe("spam");
    expect(s1.suggestionSet).toBeUndefined();
  }
});

test("multi-label task: response missing suggestedLabels surfaces an error", () => {
  const s0 = openAssistant("rec-1", null, {
    multiLabel: { configuredLabels: CONFIGURED, predicted: ["spam"] },
  });
  const wrongShape = {
    suggestedLabel: "spam",
    confidence: "high",
    reasoning: "x",
    evidenceFor: [],
    evidenceAgainst: [],
    recommendedAction: "accept",
  } as unknown as AssistantMultiLabelResponse;
  const r0 = reduceAssistant(s0, { kind: "streamEnd", response: wrongShape });
  const s1 = (r0.overlay as { state: typeof s0 }).state;
  expect(s1.status).toBe("error");
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
