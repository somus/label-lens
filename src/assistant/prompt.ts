import { createHash } from "node:crypto";

/**
 * Canonical assistant-prompt payload. Hash of this struct gates the
 * `assistant_queries` cache (per PRD §10.5). Including `provider`, `model`,
 * and `prompt_template_version` means swapping models or editing the prompt
 * template invalidates cache entries automatically.
 */
export type CanonicalPromptInput = {
  task: string;
  labels: { name: string; definition?: string }[];
  guidelines: string;
  candidate_text: string;
  context_before: string | null;
  context_after: string | null;
  predictions: { label: string; source: string; confidence?: number; reason?: string }[];
  provider: string;
  model: string;
  prompt_template_version: string;
  /**
   * Project-supplied addendum appended to the system prompt. Hashed alongside
   * the template version so editing `assistant.systemPromptAppend` invalidates
   * the cache automatically (PRD §10.5).
   */
  system_prompt_append?: string;
};

/**
 * Deterministic JSON: outer keys + nested objects emitted in fixed order,
 * label/prediction arrays sorted, so identical inputs always serialise to
 * the same string regardless of caller construction order.
 */
export function canonicalizePrompt(input: CanonicalPromptInput): string {
  const labels = [...input.labels]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((l) =>
      l.definition === undefined ? { name: l.name } : { name: l.name, definition: l.definition },
    );
  const predictions = [...input.predictions]
    .sort((a, b) => {
      const s = a.source.localeCompare(b.source);
      return s !== 0 ? s : a.label.localeCompare(b.label);
    })
    .map((p) => {
      const out: Record<string, unknown> = { label: p.label, source: p.source };
      if (p.confidence !== undefined) out.confidence = p.confidence;
      if (p.reason !== undefined) out.reason = p.reason;
      return out;
    });
  const ordered: Record<string, unknown> = {
    task: input.task,
    labels,
    guidelines: input.guidelines,
    candidate_text: input.candidate_text,
    context_before: input.context_before,
    context_after: input.context_after,
    predictions,
    provider: input.provider,
    model: input.model,
    prompt_template_version: input.prompt_template_version,
  };
  if (input.system_prompt_append !== undefined && input.system_prompt_append.length > 0) {
    ordered.system_prompt_append = input.system_prompt_append;
  }
  return JSON.stringify(ordered);
}

export function hashPrompt(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex");
}

type RecordLike = {
  id: string;
  text: string;
  context_before: string | null;
  context_after: string | null;
};

export function buildPromptInput(args: {
  record: RecordLike;
  task: string;
  labels: { name: string; definition?: string }[];
  guidelines: string;
  predictions: { label: string; source: string; confidence?: number; reason?: string }[];
  provider: string;
  model: string;
  promptTemplateVersion: string;
  systemPromptAppend?: string;
}): CanonicalPromptInput {
  return {
    task: args.task,
    labels: args.labels.map((l) =>
      l.definition === undefined ? { name: l.name } : { name: l.name, definition: l.definition },
    ),
    guidelines: args.guidelines,
    candidate_text: args.record.text,
    context_before: args.record.context_before,
    context_after: args.record.context_after,
    predictions: args.predictions.map((p) => {
      const out: { label: string; source: string; confidence?: number; reason?: string } = {
        label: p.label,
        source: p.source,
      };
      if (p.confidence !== undefined) out.confidence = p.confidence;
      if (p.reason !== undefined) out.reason = p.reason;
      return out;
    }),
    provider: args.provider,
    model: args.model,
    prompt_template_version: args.promptTemplateVersion,
    ...(args.systemPromptAppend !== undefined && args.systemPromptAppend.length > 0
      ? { system_prompt_append: args.systemPromptAppend }
      : {}),
  };
}
