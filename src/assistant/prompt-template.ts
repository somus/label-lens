import type { CanonicalPromptInput } from "./prompt.ts";

/**
 * Bump on any change to `buildAssistantPrompt` that alters what the model
 * sees (added/removed sections, reordered instructions, new label-format
 * conventions). Hash includes this so stale cache entries are invalidated
 * automatically — reviewers don't need to wipe the DB after a prompt edit.
 */
export const PROMPT_TEMPLATE_VERSION = "1.2.0";

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
  return input.task === "extraction"
    ? buildExtractionPrompt(input)
    : buildClassificationPrompt(input);
}

function buildClassificationPrompt(input: CanonicalPromptInput): AssistantPromptParts {
  const baseLines = [
    "You are an expert annotator helping a reviewer classify text records.",
    "Always call the `submit_label_suggestion` tool exactly once with your analysis.",
    "Pick `suggestedLabel` from the configured label set; never invent new labels.",
    "Keep `reasoning` to 2-3 sentences. Bullet phrases in `evidenceFor` / `evidenceAgainst` should be short (one phrase per item).",
    `Task: ${input.task}`,
  ];
  if (input.system_prompt_append !== undefined && input.system_prompt_append.length > 0) {
    baseLines.push("", "## Project rules", input.system_prompt_append);
  }
  const systemPrompt = baseLines.join("\n");

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

function buildExtractionPrompt(input: CanonicalPromptInput): AssistantPromptParts {
  const fields = input.extraction_fields ?? [];
  const fieldNames = fields.map((f) => f.name).join(", ");
  const baseLines = [
    "You are an expert at extracting structured fields from short text records.",
    "Always call the `submit_label_suggestion` tool exactly once with your analysis.",
    "`extractedObject` MUST be an object whose keys are EXACTLY the configured field names — no other keys, no nested objects, values are strings or null only.",
    "Copy values verbatim from the candidate text whenever they appear there. Keep currency symbols ($, €, ₹), punctuation, casing, and decimals exactly as written. Do NOT round, drop a `$`, normalise `2026/05/15` to `2026-05-15`, or invent a default like `0` or `n/a`. Use null only when the value is genuinely absent from the candidate.",
    'CRITICAL: `reasoning` and `extractedObject` MUST agree value-for-value. If reasoning says "set amount to $325.50", `extractedObject.amount` MUST be exactly the string "$325.50". Never describe one value in reasoning and emit a different value (e.g. "0", null, empty string) in the structured payload — verify each field after writing reasoning before submitting.',
    'Treat the existing predictions as your starting point: when an existing prediction is already correct, return its values unchanged and set `recommendedAction: "accept"`. When you correct any field, set `recommendedAction: "relabel"`. Use `reject` only when the candidate is unrelated to the task or a required field is genuinely absent from the candidate; `skip` when ambiguous.',
    'Required fields must never be null when `recommendedAction` is `accept` or `relabel`. If a required field is truly missing from the candidate, set `recommendedAction: "reject"` instead.',
    "Keep `reasoning` to 1-2 sentences focused on which fields you changed and why. `evidenceFor` / `evidenceAgainst` are short phrases (one per item, optional).",
    `Task: extraction`,
    `Configured fields: ${fieldNames || "(none)"}`,
  ];
  if (input.system_prompt_append !== undefined && input.system_prompt_append.length > 0) {
    baseLines.push("", "## Project rules", input.system_prompt_append);
  }
  const systemPrompt = baseLines.join("\n");

  const fieldLines =
    fields.length === 0
      ? ["(no fields configured)"]
      : fields.map((f) => `- ${f.name} (${f.type}${f.required ? ", required" : ", optional"})`);

  // Format each prediction's label as a JSON object on its own indented
  // line so the LLM sees the structured starting point clearly.
  const predictionLines =
    input.predictions.length === 0
      ? ["(no predictions)"]
      : input.predictions.flatMap((p) => {
          const meta: string[] = [];
          if (p.confidence !== undefined) meta.push(`confidence: ${p.confidence}`);
          if (p.reason !== undefined) meta.push(`reason: ${p.reason}`);
          const header = `- source: ${p.source}${meta.length > 0 ? `, ${meta.join(", ")}` : ""}`;
          // p.label is canonical JSON object text; re-stringify with 2-space
          // indent so the LLM doesn't have to mentally parse a one-liner.
          let pretty = p.label;
          try {
            pretty = JSON.stringify(JSON.parse(p.label), null, 2);
          } catch {
            // Falls back to the raw text — the schema guard above will
            // already have rejected anything truly malformed at commit time.
          }
          return [header, pretty];
        });

  const sections: string[] = [
    "## Field schema",
    ...fieldLines,
    "",
    "## Guidelines",
    input.guidelines.length > 0 ? input.guidelines : "(none provided)",
    "",
    "## Existing predictions (objects keyed by configured field names; correct in place)",
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
