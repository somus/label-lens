import type { CanonicalPromptInput } from "./prompt.ts";

/**
 * Bump on any change to `buildAssistantPrompt` that alters what the model
 * sees (added/removed sections, reordered instructions, new label-format
 * conventions). Hash includes this so stale cache entries are invalidated
 * automatically — reviewers don't need to wipe the DB after a prompt edit.
 */
export const PROMPT_TEMPLATE_VERSION = "1.0.0";

export type AssistantPromptParts = {
  systemPrompt: string;
  userPrompt: string;
};

/**
 * Assembles the full prompt the model sees. Returns the system + user
 * halves separately so the caller can feed them into pi-ai's `Context`
 * (`systemPrompt` + a single `user` message). Layout is deterministic to
 * keep the hash stable.
 */
export function buildAssistantPrompt(input: CanonicalPromptInput): AssistantPromptParts {
  const systemPrompt = [
    "You are an expert annotator helping a reviewer classify text records.",
    "Always call the `submit_label_suggestion` tool exactly once with your analysis.",
    "Pick `suggestedLabel` from the configured label set; never invent new labels.",
    "Keep `reasoning` to 2-3 sentences. Bullet phrases in `evidenceFor` / `evidenceAgainst` should be short (one phrase per item).",
    `Task: ${input.task}`,
  ].join("\n");

  const labelLines = input.labels.map((l) =>
    l.definition ? `- ${l.name}: ${l.definition}` : `- ${l.name}`,
  );

  const predictionLines =
    input.predictions.length === 0
      ? ["(no predictions)"]
      : input.predictions.map((p) => {
          const parts = [`- ${p.label} (source: ${p.source})`];
          if (p.confidence !== undefined) parts.push(`confidence: ${p.confidence}`);
          if (p.reason !== undefined) parts.push(`reason: ${p.reason}`);
          return parts.join(", ");
        });

  const sections: string[] = [
    "## Label set",
    ...labelLines,
    "",
    "## Guidelines",
    input.guidelines.length > 0 ? input.guidelines : "(none provided)",
    "",
    "## Existing predictions",
    ...predictionLines,
    "",
  ];

  if (input.context_before) {
    sections.push("## Context before", input.context_before, "");
  }

  sections.push("## Candidate", input.candidate_text);

  if (input.context_after) {
    sections.push("", "## Context after", input.context_after);
  }

  return {
    systemPrompt,
    userPrompt: sections.join("\n"),
  };
}
