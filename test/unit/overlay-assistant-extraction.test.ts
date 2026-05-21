import { describe, expect, test } from "bun:test";
import type { AssistantExtractionResponse } from "../../src/assistant/schema.ts";
import type { ExtractionField } from "../../src/config/config.ts";
import { openAssistant, reduceAssistant } from "../../src/overlay/assistant.ts";
import type { OverlayEvent } from "../../src/overlay/types.ts";

const FIELDS: ExtractionField[] = [
  { name: "company", type: "string", required: true },
  { name: "amount", type: "string", required: false },
];

function streamEnd(response: AssistantExtractionResponse): OverlayEvent {
  return { kind: "streamEnd", response };
}

describe("assistant overlay — extraction task", () => {
  test("opens with extraction context attached", () => {
    const state = openAssistant("rec1", null, {
      extraction: {
        fields: FIELDS,
        predictedObject: { company: "Acme", amount: null },
      },
    });
    expect(state.extraction).toBeDefined();
    expect(state.extraction?.predictedObject.company).toBe("Acme");
  });

  test("streamEnd reads LLM values by `f.name`, ignoring the source-side `key` alias", () => {
    // Regression for the user-reported "amount=0" / "amount=∅" bug.
    // The tool schema is keyed by `f.name`, so the LLM returns
    // `{ amount: "19.99" }` (not `{ amt: "19.99" }`) even when the
    // configured field declares `key: "amt"`. The streamEnd reducer
    // used to call `canonicalizeExtractionObject`, which is for the
    // ingest-side source JSON shape and reads by `f.key ?? f.name`;
    // it would silently null out every aliased field on the LLM
    // response.
    const aliasedFields: ExtractionField[] = [
      { name: "company", type: "string", required: true },
      { name: "amount", type: "string", required: true, key: "amt" },
    ];
    const initial = openAssistant("rec1", null, {
      extraction: { fields: aliasedFields, predictedObject: { company: "Acme", amount: null } },
    });
    const result = reduceAssistant(
      initial,
      streamEnd({
        extractedObject: { company: "Acme", amount: "19.99" },
        confidence: "high",
        reasoning: "",
        evidenceFor: [],
        evidenceAgainst: [],
        recommendedAction: "relabel",
      }),
    );
    if (result.overlay?.kind === "assistant" && result.overlay.state.status === "done") {
      expect(result.overlay.state.suggestionObject).toEqual({
        company: "Acme",
        amount: "19.99",
      });
    } else {
      throw new Error("expected done state");
    }
  });

  test("streamEnd canonicalises suggestedObject against configured fields", () => {
    const initial = openAssistant("rec1", null, {
      extraction: {
        fields: FIELDS,
        predictedObject: { company: "Acme", amount: null },
      },
    });
    const result = reduceAssistant(
      initial,
      streamEnd({
        extractedObject: { company: "Acme", amount: "100", extra: "drop" },
        confidence: "high",
        reasoning: "looks right",
        evidenceFor: [],
        evidenceAgainst: [],
        recommendedAction: "accept",
      }),
    );
    if (result.overlay?.kind === "assistant" && result.overlay.state.status === "done") {
      expect(result.overlay.state.suggestionObject).toEqual({ company: "Acme", amount: "100" });
    } else {
      throw new Error("expected done state");
    }
  });

  test("streamEnd with non-extraction response surfaces an error", () => {
    const initial = openAssistant("rec1", null, {
      extraction: {
        fields: FIELDS,
        predictedObject: { company: "Acme", amount: null },
      },
    });
    const result = reduceAssistant(initial, {
      kind: "streamEnd",
      response: {
        suggestedLabel: "spam",
        confidence: "high",
        reasoning: "",
        evidenceFor: [],
        evidenceAgainst: [],
        recommendedAction: "accept",
      },
    });
    if (result.overlay?.kind === "assistant" && result.overlay.state.status === "error") {
      expect(result.overlay.state.errorMessage).toMatch(/extraction/i);
    } else {
      throw new Error("expected error state");
    }
  });

  test("commit emits openExtractionFormPrefilled with the suggested object as draft", () => {
    // Extraction Enter no longer auto-commits the LLM's suggestion;
    // it opens the form pre-populated with `extractedObject` so the
    // reviewer can verify each field before committing via the form's
    // own Enter.
    const initial = openAssistant("rec1", null, {
      extraction: {
        fields: FIELDS,
        predictedObject: { company: "Acme", amount: null },
      },
    });
    const afterStreamEnd = reduceAssistant(
      initial,
      streamEnd({
        extractedObject: { company: "Beta", amount: "100" },
        confidence: "high",
        reasoning: "",
        evidenceFor: [],
        evidenceAgainst: [],
        recommendedAction: "relabel",
      }),
    );
    if (afterStreamEnd.overlay?.kind !== "assistant") throw new Error("expected overlay");
    const commit = reduceAssistant(afterStreamEnd.overlay.state, { kind: "commit" });
    const open = commit.effects.find((e) => e.kind === "openExtractionFormPrefilled");
    expect(open).toBeDefined();
    if (open?.kind === "openExtractionFormPrefilled") {
      expect(open.recordId).toBe("rec1");
      expect(open.prefilled).toEqual({ company: "Beta", amount: "100" });
      expect(open.predicted).toEqual({ company: "Acme", amount: null });
    }
    // The reducer should NOT emit a direct commitDecision for the
    // relabel path under the prefill-form model.
    expect(commit.effects.find((e) => e.kind === "commitDecision")).toBeUndefined();
  });

  test("recommendedAction='accept' also opens the prefilled form (still reviewer-confirmed)", () => {
    const initial = openAssistant("rec1", null, {
      extraction: {
        fields: FIELDS,
        predictedObject: { company: "Acme", amount: null },
      },
    });
    const afterStreamEnd = reduceAssistant(
      initial,
      streamEnd({
        extractedObject: { company: "Acme", amount: null },
        confidence: "high",
        reasoning: "",
        evidenceFor: [],
        evidenceAgainst: [],
        recommendedAction: "accept",
      }),
    );
    if (afterStreamEnd.overlay?.kind !== "assistant") throw new Error("expected overlay");
    const commit = reduceAssistant(afterStreamEnd.overlay.state, { kind: "commit" });
    expect(commit.effects.find((e) => e.kind === "openExtractionFormPrefilled")).toBeDefined();
  });

  test("recommendedAction='reject' still commits directly via commitDecision (no form needed)", () => {
    const initial = openAssistant("rec1", null, {
      extraction: {
        fields: FIELDS,
        predictedObject: { company: "Acme", amount: null },
      },
    });
    const afterStreamEnd = reduceAssistant(
      initial,
      streamEnd({
        extractedObject: { company: null, amount: null },
        confidence: "low",
        reasoning: "",
        evidenceFor: [],
        evidenceAgainst: [],
        recommendedAction: "reject",
      }),
    );
    if (afterStreamEnd.overlay?.kind !== "assistant") throw new Error("expected overlay");
    const commit = reduceAssistant(afterStreamEnd.overlay.state, { kind: "commit" });
    const decision = commit.effects.find((e) => e.kind === "commitDecision");
    expect(decision).toBeDefined();
    expect((decision as { status: string }).status).toBe("rejected");
  });

  test("commit on a required-field-missing relabel still opens the form so the reviewer can fix it", () => {
    // Previously the reducer refused the commit (overlay stays open, no
    // effects). Under the prefill-form model the form opens with the
    // partially-filled object — the form's own required-field gate then
    // prevents Enter→commit until the reviewer fixes the missing field.
    const initial = openAssistant("rec1", null, {
      extraction: {
        fields: FIELDS,
        predictedObject: { company: "Acme", amount: null },
      },
    });
    const afterStreamEnd = reduceAssistant(
      initial,
      streamEnd({
        extractedObject: { company: null, amount: "100" },
        confidence: "high",
        reasoning: "",
        evidenceFor: [],
        evidenceAgainst: [],
        recommendedAction: "relabel",
      }),
    );
    if (afterStreamEnd.overlay?.kind !== "assistant") throw new Error("expected overlay");
    const commit = reduceAssistant(afterStreamEnd.overlay.state, { kind: "commit" });
    const open = commit.effects.find((e) => e.kind === "openExtractionFormPrefilled");
    expect(open).toBeDefined();
    if (open?.kind === "openExtractionFormPrefilled") {
      expect(open.prefilled).toEqual({ company: null, amount: "100" });
    }
  });
});
