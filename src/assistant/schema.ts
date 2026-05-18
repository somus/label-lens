import { type Static, Type } from "@earendil-works/pi-ai";

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

const VALID_CONFIDENCES = new Set(["low", "medium", "high"]);
const VALID_ACTIONS = new Set(["accept", "relabel", "reject", "skip"]);

/**
 * Runtime guard: a cached row passed `JSON.parse` but the producer (the LLM
 * or a stale cache) could still emit the wrong shape. Reject anything that
 * doesn't match — caller treats the row as a cache miss and re-queries.
 */
export function isAssistantResponse(value: unknown): value is AssistantResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.suggestedLabel === "string" &&
    typeof v.confidence === "string" &&
    VALID_CONFIDENCES.has(v.confidence) &&
    typeof v.reasoning === "string" &&
    Array.isArray(v.evidenceFor) &&
    v.evidenceFor.every((x) => typeof x === "string") &&
    Array.isArray(v.evidenceAgainst) &&
    v.evidenceAgainst.every((x) => typeof x === "string") &&
    typeof v.recommendedAction === "string" &&
    VALID_ACTIONS.has(v.recommendedAction)
  );
}
