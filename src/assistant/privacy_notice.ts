/**
 * Verbatim privacy notice from PRD §10.5 "What gets sent (transparency)".
 * Rendered in the `configure-assistant` overlay before any remote call
 * commits (slice 11C). Lift updates to the PRD propagate here and only
 * here — never reword in two places.
 */
export const ASSISTANT_PRIVACY_NOTICE =
  "When the assistant is enabled and a remote provider is configured, each `i` query sends the current record's candidate text, before/after context, label definitions, and prediction metadata to the configured provider. It does not send the entire dataset, other records, or review history. Calls are cached locally by (record_id, prompt_hash), so re-asking on the same record is free. With --local-only or an Ollama provider, no data leaves the machine.";
