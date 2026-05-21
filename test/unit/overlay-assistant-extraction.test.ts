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

  test("commit emits a relabeled commitDecision when suggested differs from predicted", () => {
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
    const decision = commit.effects.find((e) => e.kind === "commitDecision");
    expect(decision).toBeDefined();
    expect((decision as { status: string }).status).toBe("relabeled");
    expect((decision as { finalLabel: string | null }).finalLabel).toBe(
      '{"company":"Beta","amount":"100"}',
    );
    expect((decision as { prevLabel: string | null }).prevLabel).toBe(
      '{"company":"Acme","amount":null}',
    );
    expect((decision as { sourceOfTruth: string }).sourceOfTruth).toBe("human+assistant");
  });

  test("commit refused when assistant suggestion omits a required field", () => {
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
    expect(commit.effects.find((e) => e.kind === "commitDecision")).toBeUndefined();
  });
});
