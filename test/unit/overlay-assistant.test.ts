import { describe, expect, test } from "bun:test";
import type { AssistantResponse } from "../../src/assistant/schema.ts";
import { openAssistant, reduceAssistant } from "../../src/overlay/assistant.ts";
import type { AssistantState, ReduceResult } from "../../src/overlay/types.ts";

const RECORD_ID = "rec-1";

const validResponse: AssistantResponse = {
  suggestedLabel: "food",
  confidence: "high",
  reasoning: "Cafe + lunch.",
  evidenceFor: ["lunch"],
  evidenceAgainst: [],
  recommendedAction: "accept",
};

function press(state: AssistantState, name: string): ReduceResult {
  return reduceAssistant(state, { kind: "key", event: { name } });
}

function state(r: ReduceResult): AssistantState {
  if (!r.overlay || r.overlay.kind !== "assistant") throw new Error("expected assistant overlay");
  return r.overlay.state;
}

describe("openAssistant", () => {
  test("starts in loading with empty buffer", () => {
    const s = openAssistant(RECORD_ID);
    expect(s.status).toBe("loading");
    expect(s.buffer).toBe("");
    expect(s.suggestion).toBeNull();
    expect(s.recommendedAction).toBeNull();
    expect(s.reasoningExpanded).toBe(false);
  });
});

describe("streaming events", () => {
  test("streamToken appends to buffer + flips status to streaming", () => {
    let s = openAssistant(RECORD_ID);
    let r = reduceAssistant(s, { kind: "streamToken", token: "Hello" });
    s = state(r);
    expect(s.status).toBe("streaming");
    expect(s.buffer).toBe("Hello");
    r = reduceAssistant(s, { kind: "streamToken", token: " world" });
    expect(state(r).buffer).toBe("Hello world");
  });

  test("streamEnd with response sets suggestion + done status", () => {
    let s = openAssistant(RECORD_ID);
    s = state(reduceAssistant(s, { kind: "streamToken", token: "thinking" }));
    const r = reduceAssistant(s, { kind: "streamEnd", response: validResponse });
    const next = state(r);
    expect(next.status).toBe("done");
    expect(next.suggestion).toBe("food");
    expect(next.confidence).toBe("high");
    expect(next.recommendedAction).toBe("accept");
    expect(next.reason).toBe("Cafe + lunch.");
  });

  test("streamEnd without response flips status to error", () => {
    const s = openAssistant(RECORD_ID);
    const r = reduceAssistant(s, { kind: "streamEnd" });
    const next = state(r);
    expect(next.status).toBe("error");
    expect(next.errorMessage).toContain("structured response");
  });

  test("streamError captures the message", () => {
    const s = openAssistant(RECORD_ID);
    const r = reduceAssistant(s, { kind: "streamError", error: new Error("network down") });
    const next = state(r);
    expect(next.status).toBe("error");
    expect(next.errorMessage).toContain("network down");
  });
});

describe("key handling", () => {
  function doneState(): AssistantState {
    let s = openAssistant(RECORD_ID);
    s = state(reduceAssistant(s, { kind: "streamEnd", response: validResponse }));
    return s;
  }

  test("Tab toggles reasoningExpanded", () => {
    let s = doneState();
    expect(s.reasoningExpanded).toBe(false);
    s = state(press(s, "tab"));
    expect(s.reasoningExpanded).toBe(true);
    s = state(press(s, "tab"));
    expect(s.reasoningExpanded).toBe(false);
  });

  test("Enter while streaming is a no-op", () => {
    let s = openAssistant(RECORD_ID);
    s = state(reduceAssistant(s, { kind: "streamToken", token: "x" }));
    const r = press(s, "return");
    expect(r.overlay).not.toBeNull();
    expect(r.effects).toEqual([]);
  });

  test("Enter when done emits markAssistantViewed + commitDecision + close", () => {
    const s = doneState();
    const r = press(s, "return");
    expect(r.overlay).toBeNull();
    const kinds = r.effects.map((e) => e.kind);
    expect(kinds).toEqual(["markAssistantViewed", "commitDecision", "close"]);
    const decision = r.effects.find((e) => e.kind === "commitDecision");
    if (decision?.kind === "commitDecision") {
      expect(decision.status).toBe("accepted");
      expect(decision.finalLabel).toBe("food");
      expect(decision.sourceOfTruth).toBe("human+assistant");
    }
  });

  test("relabel recommendation maps to status='relabeled'", () => {
    let s = openAssistant(RECORD_ID);
    s = state(
      reduceAssistant(s, {
        kind: "streamEnd",
        response: { ...validResponse, recommendedAction: "relabel", suggestedLabel: "travel" },
      }),
    );
    const r = press(s, "return");
    const decision = r.effects.find((e) => e.kind === "commitDecision");
    if (decision?.kind === "commitDecision") {
      expect(decision.status).toBe("relabeled");
      expect(decision.finalLabel).toBe("travel");
    }
  });

  test("reject recommendation clears finalLabel", () => {
    let s = openAssistant(RECORD_ID);
    s = state(
      reduceAssistant(s, {
        kind: "streamEnd",
        response: { ...validResponse, recommendedAction: "reject" },
      }),
    );
    const r = press(s, "return");
    const decision = r.effects.find((e) => e.kind === "commitDecision");
    if (decision?.kind === "commitDecision") {
      expect(decision.status).toBe("rejected");
      expect(decision.finalLabel).toBeNull();
    }
  });

  test("Esc dismisses but still emits markAssistantViewed (ADR 0004)", () => {
    const s = doneState();
    const r = press(s, "escape");
    expect(r.overlay).toBeNull();
    expect(r.effects.map((e) => e.kind)).toEqual(["markAssistantViewed", "close"]);
  });

  test("Esc while streaming still marks viewed", () => {
    let s = openAssistant(RECORD_ID);
    s = state(reduceAssistant(s, { kind: "streamToken", token: "partial" }));
    const r = press(s, "escape");
    expect(r.effects.some((e) => e.kind === "markAssistantViewed")).toBe(true);
  });

  test("cancel event behaves like Esc", () => {
    const s = doneState();
    const r = reduceAssistant(s, { kind: "cancel" });
    expect(r.overlay).toBeNull();
    expect(r.effects.some((e) => e.kind === "markAssistantViewed")).toBe(true);
  });

  test("malformed recommendedAction emits invalidAction + close, doesn't get stuck", () => {
    let s = openAssistant(RECORD_ID, "food");
    s = state(
      reduceAssistant(s, {
        kind: "streamEnd",
        response: {
          ...validResponse,
          // biome-ignore lint/suspicious/noExplicitAny: simulating a malformed response that bypasses StringEnum.
          recommendedAction: "nonsense" as any,
        },
      }),
    );
    const r = press(s, "return");
    expect(r.overlay).toBeNull();
    const kinds = r.effects.map((e) => e.kind);
    expect(kinds).toContain("assistantInvalidAction");
    expect(kinds).toContain("close");
    // No commitDecision — we don't want a half-formed audit row.
    expect(kinds).not.toContain("commitDecision");
    const invalid = r.effects.find((e) => e.kind === "assistantInvalidAction");
    if (invalid?.kind === "assistantInvalidAction") {
      expect(invalid.action).toBe("nonsense");
    }
  });

  test("relabel decision threads predictedLabel into prev_label", () => {
    let s = openAssistant(RECORD_ID, "travel");
    s = state(
      reduceAssistant(s, {
        kind: "streamEnd",
        response: { ...validResponse, recommendedAction: "relabel", suggestedLabel: "food" },
      }),
    );
    const r = press(s, "return");
    const decision = r.effects.find((e) => e.kind === "commitDecision");
    if (decision?.kind === "commitDecision") {
      expect(decision.status).toBe("relabeled");
      expect(decision.prevLabel).toBe("travel");
      expect(decision.finalLabel).toBe("food");
    } else {
      throw new Error("expected commitDecision");
    }
  });

  test("accept decision keeps prev_label null even with predictedLabel set", () => {
    let s = openAssistant(RECORD_ID, "food");
    s = state(reduceAssistant(s, { kind: "streamEnd", response: validResponse }));
    const r = press(s, "return");
    const decision = r.effects.find((e) => e.kind === "commitDecision");
    if (decision?.kind === "commitDecision") {
      expect(decision.status).toBe("accepted");
      expect(decision.prevLabel).toBeNull();
    } else {
      throw new Error("expected commitDecision");
    }
  });

  test("empty reasoning still settles to done; reducer keeps Tab toggle for symmetry", () => {
    let s = openAssistant(RECORD_ID);
    s = state(
      reduceAssistant(s, {
        kind: "streamEnd",
        response: { ...validResponse, reasoning: "" },
      }),
    );
    expect(s.status).toBe("done");
    expect(s.reason).toBe("");
    // Tab toggle stays cheap — render layer decides whether to surface the hint.
    s = state(press(s, "tab"));
    expect(s.reasoningExpanded).toBe(true);
  });
});
