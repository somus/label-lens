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

function asStatus<S extends AssistantState["status"]>(
  s: AssistantState,
  status: S,
): Extract<AssistantState, { status: S }> {
  if (s.status !== status) throw new Error(`expected status=${status}, got ${s.status}`);
  return s as Extract<AssistantState, { status: S }>;
}

describe("openAssistant", () => {
  test("starts in loading variant with reasoningExpanded false", () => {
    const s = openAssistant(RECORD_ID);
    expect(s.status).toBe("loading");
    expect(s.reasoningExpanded).toBe(false);
  });
});

describe("streaming events", () => {
  test("streamToken appends to buffer + flips status to streaming", () => {
    let s = openAssistant(RECORD_ID);
    let r = reduceAssistant(s, { kind: "streamToken", token: "Hello" });
    const streaming = asStatus(state(r), "streaming");
    expect(streaming.buffer).toBe("Hello");
    s = streaming;
    r = reduceAssistant(s, { kind: "streamToken", token: " world" });
    expect(asStatus(state(r), "streaming").buffer).toBe("Hello world");
  });

  test("streamEnd with response sets suggestion + done status", () => {
    let s = openAssistant(RECORD_ID);
    s = state(reduceAssistant(s, { kind: "streamToken", token: "thinking" }));
    const r = reduceAssistant(s, { kind: "streamEnd", response: validResponse });
    const next = asStatus(state(r), "done");
    expect(next.suggestion).toBe("food");
    expect(next.confidence).toBe("high");
    expect(next.recommendedAction).toBe("accept");
    expect(next.reason).toBe("Cafe + lunch.");
  });

  test("streamEnd without response flips status to error", () => {
    const s = openAssistant(RECORD_ID);
    const r = reduceAssistant(s, { kind: "streamEnd" });
    const next = asStatus(state(r), "error");
    expect(next.errorMessage).toContain("structured response");
  });

  test("streamError captures the message", () => {
    const s = openAssistant(RECORD_ID);
    const r = reduceAssistant(s, { kind: "streamError", error: new Error("network down") });
    const next = asStatus(state(r), "error");
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

  test("Esc propagates to the review scope; assistant stays visible", () => {
    // The assistant strip is permanent once opened — Esc does NOT
    // dismiss it. The audit tag (ADR 0004) is set at open time by
    // `openAssistantCommand` (see open-assistant.ts), so the reducer
    // no longer needs to emit markAssistantViewed on Esc.
    const s = doneState();
    const r = press(s, "escape");
    expect(r.propagated).toBe(true);
    expect(r.overlay?.kind).toBe("assistant");
    expect(r.effects).toEqual([]);
  });

  test("Esc while streaming also just propagates", () => {
    let s = openAssistant(RECORD_ID);
    s = state(reduceAssistant(s, { kind: "streamToken", token: "partial" }));
    const r = press(s, "escape");
    expect(r.propagated).toBe(true);
    expect(r.overlay?.kind).toBe("assistant");
  });

  test("cancel event behaves like Esc", () => {
    const s = doneState();
    const r = reduceAssistant(s, { kind: "cancel" });
    expect(r.overlay).toBeNull();
    expect(r.effects.some((e) => e.kind === "markAssistantViewed")).toBe(true);
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

  test("unknown keys propagate so review-scope bindings still fire (ADR 0009)", () => {
    // Assistant is an inline section, not a modal — q (quit), a (accept),
    // x (reject), s (skip), j/k (nav), etc. must still trigger their
    // review-scope commands while the suggestion footer is visible.
    const s = openAssistant(RECORD_ID);
    for (const name of ["q", "a", "x", "s", "j", "k", ":", "?", "escape"]) {
      const r = press(s, name);
      expect(r.propagated).toBe(true);
    }
  });

  test("tab and return are NOT propagated (assistant owns these)", () => {
    // `escape` IS propagated under the always-visible model: the strip
    // does not auto-dismiss, so Esc falls through to the review scope
    // (where it is currently unbound). Only Tab (expand reasoning) and
    // Enter-when-done (commit) stay consumed by the reducer.
    const s = state(
      reduceAssistant(openAssistant(RECORD_ID), {
        kind: "streamEnd",
        response: validResponse,
      }),
    );
    expect(press(s, "tab").propagated).toBeUndefined();
    expect(press(s, "return").propagated).toBeUndefined();
  });

  test("empty reasoning still settles to done; reducer keeps Tab toggle for symmetry", () => {
    let s = openAssistant(RECORD_ID);
    const done = asStatus(
      state(
        reduceAssistant(s, {
          kind: "streamEnd",
          response: { ...validResponse, reasoning: "" },
        }),
      ),
      "done",
    );
    expect(done.reason).toBe("");
    // Tab toggle stays cheap — render layer decides whether to surface the hint.
    s = state(press(done, "tab"));
    expect(s.reasoningExpanded).toBe(true);
  });
});
