import { type Static, Type } from "@earendil-works/pi-ai";
import { Value } from "typebox/value";

/**
 * Structured response shape per PRD §10.5. Surfaced to the reviewer in the
 * inline assistant footer (slice 11C). pi-ai is invoked with a single tool
 * whose parameters mirror this schema; the model is instructed to call the
 * tool exactly once with its analysis, and the tool arguments become our
 * response payload.
 */
export const AssistantResponseSchema = Type.Object({
  suggestedLabel: Type.String({
    description: "Configured label the assistant recommends for this record.",
  }),
  confidence: Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
    description: "Assistant's confidence in its own recommendation.",
  }),
  reasoning: Type.String({
    description: "Markdown-formatted explanation of the recommendation.",
  }),
  evidenceFor: Type.Array(Type.String(), {
    description: "Short bullet phrases supporting the suggested label.",
  }),
  evidenceAgainst: Type.Array(Type.String(), {
    description: "Short bullet phrases against the suggested label.",
  }),
  recommendedAction: Type.Union(
    [Type.Literal("accept"), Type.Literal("relabel"), Type.Literal("reject"), Type.Literal("skip")],
    {
      description:
        "How the reviewer should commit: accept the prediction, relabel to suggestedLabel, reject, or skip.",
    },
  ),
});

export type AssistantResponse = Static<typeof AssistantResponseSchema>;

/**
 * Multi-label variant — replaces `suggestedLabel: string` with
 * `suggestedLabels: string[]`. Other fields mirror the single-label schema
 * so reasoning / confidence / recommendedAction render identically.
 */
export const AssistantMultiLabelResponseSchema = Type.Object({
  suggestedLabels: Type.Array(Type.String(), {
    description: "Configured labels the assistant recommends for this record (complete set).",
  }),
  confidence: Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
    description: "Assistant's confidence in its own recommendation.",
  }),
  reasoning: Type.String({
    description: "Markdown-formatted explanation of the recommendation.",
  }),
  evidenceFor: Type.Array(Type.String(), {
    description: "Short bullet phrases supporting the suggested set.",
  }),
  evidenceAgainst: Type.Array(Type.String(), {
    description: "Short bullet phrases against the suggested set.",
  }),
  recommendedAction: Type.Union(
    [Type.Literal("accept"), Type.Literal("relabel"), Type.Literal("reject"), Type.Literal("skip")],
    {
      description:
        "How the reviewer should commit: accept the predicted set, relabel to suggestedLabels, reject, or skip.",
    },
  ),
});

export type AssistantMultiLabelResponse = Static<typeof AssistantMultiLabelResponseSchema>;

/**
 * Runtime guard: a cached row passed `JSON.parse` but the producer (the LLM
 * or a stale cache) could still emit the wrong shape. Derived from
 * `AssistantResponseSchema` via TypeBox so the validator can never drift
 * from the declared schema.
 */
export function isAssistantResponse(value: unknown): value is AssistantResponse {
  return Value.Check(AssistantResponseSchema, value);
}

export function isAssistantMultiLabelResponse(
  value: unknown,
): value is AssistantMultiLabelResponse {
  return Value.Check(AssistantMultiLabelResponseSchema, value);
}

/**
 * Extraction variant — replaces `suggestedLabel: string` with
 * `extractedObject: Record<string, string | null>`. Validation against the
 * configured `extraction.fields` happens post-decode in the provider so the
 * schema itself stays field-agnostic.
 */
export const AssistantExtractionResponseSchema = Type.Object({
  extractedObject: Type.Record(Type.String(), Type.Union([Type.String(), Type.Null()]), {
    description:
      "Complete suggested extraction object. Keys must match the configured extraction.fields names; values are string or null.",
  }),
  confidence: Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
    description: "Assistant's confidence in its own recommendation.",
  }),
  reasoning: Type.String({
    description: "Markdown-formatted explanation of the recommendation.",
  }),
  evidenceFor: Type.Array(Type.String(), {
    description: "Short bullet phrases supporting the suggested object.",
  }),
  evidenceAgainst: Type.Array(Type.String(), {
    description: "Short bullet phrases against the suggested object.",
  }),
  recommendedAction: Type.Union(
    [Type.Literal("accept"), Type.Literal("relabel"), Type.Literal("reject"), Type.Literal("skip")],
    {
      description:
        "How the reviewer should commit: accept the predicted object, relabel to extractedObject, reject, or skip.",
    },
  ),
});

export type AssistantExtractionResponse = Static<typeof AssistantExtractionResponseSchema>;

export function isAssistantExtractionResponse(
  value: unknown,
): value is AssistantExtractionResponse {
  return Value.Check(AssistantExtractionResponseSchema, value);
}

export type AssistantResponseAny =
  | AssistantResponse
  | AssistantMultiLabelResponse
  | AssistantExtractionResponse;
