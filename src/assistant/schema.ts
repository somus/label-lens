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
 * Runtime guard: a cached row passed `JSON.parse` but the producer (the LLM
 * or a stale cache) could still emit the wrong shape. Derived from
 * `AssistantResponseSchema` via TypeBox so the validator can never drift
 * from the declared schema.
 */
export function isAssistantResponse(value: unknown): value is AssistantResponse {
  return Value.Check(AssistantResponseSchema, value);
}
