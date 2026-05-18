# Assistant audit — why viewing counts as influence

When you press `i` and read the LLM's suggestion for a record, that suggestion has influenced you — even if you dismiss it with `Esc` and pick a different label. LabelLens records this with a `source_of_truth = "human+assistant"` tag on the resulting annotation (or any subsequent annotation for that record during the same focus session).

ADR 0004 captures the rationale.

## Two possible designs we considered

**Design A (rejected): tag `human+assistant` only when the reviewer accepts the suggestion via `Enter`.**

Clean, narrow, easy to explain. But undercounts assistant influence. Common pattern: reviewer presses `i`, reads the suggestion, doesn't agree, dismisses, picks a different label that's still anchored by what they just read. That's contamination; the tag should reflect it.

**Design B (chosen): tag `human+assistant` whenever the assistant panel was opened for the record during the current focus session, regardless of whether `Enter` was the commit gesture.**

Audit conservative. If you're investigating "did an LLM influence this dataset?", the answer is more honest. Errs on the side of over-counting — better than missing a real influence.

## What counts as "the focus session"

The focus session starts when you navigate to a record (via `j`, `k`, `[`, `]`, `:queue`, drilldown from stats, etc.) and ends when you navigate away. While focused:

- Opening the assistant (`i`) adds the record id to `app.viewedAssistant`.
- Any decision you commit (`a`, `r`, digit, per-label key, `x`, `s`, the assistant overlay's `Enter`) checks the set. If the record id is in there, the resulting review row gets `source_of_truth = "human+assistant"`.

When you navigate to a new record, the set is cleared. Each focus session starts fresh.

## Edge cases this handles

- **You open the assistant, dismiss, then accept the original prediction.** Tagged `human+assistant`. You saw the suggestion; influence is recorded.
- **You open, dismiss, navigate away without committing.** Nothing recorded — no annotation, nothing to tag.
- **You navigate away, come back, commit without opening assistant.** Tagged `human` — fresh focus session, set is empty.
- **You open the assistant, take a cache hit (no network call), commit.** Still tagged `human+assistant`. The cache hit doesn't change whether you were influenced.

## What this enables

- **Provenance audits**: `jq 'select(.source_of_truth == "human+assistant")' audit.jsonl` finds every record the LLM touched.
- **Contamination claims**: if a downstream model trained on this dataset is suspected of LLM-leakage, you can quantify the exposure.
- **Quality dashboards**: future stats surface rows could compare per-source rates between `human` and `human+assistant` annotations to detect anchoring bias.

## What this does not record

- **Per-record viewing counts** — the set is binary, "viewed or not". If you opened the assistant five times on a record before committing, the tag is the same as if you opened it once.
- **Which suggestion you saw** — the assistant_queries cache row holds the suggestion separately, joined by `(record_id, prompt_hash)` to the time you viewed it. Future audit tooling can reconstruct the full history; the review row alone won't tell you what the LLM said.
- **The model name / provider** — same as above. Lives in the assistant_queries row, not the review row.

## Related

- [ADR 0004](../adr/0004-source-of-truth-includes-viewing.md) — the formal decision record.
- [Reference: output-schema](../reference/output-schema.md) — where the `source_of_truth` column appears in exports.
- [How-to: configure the assistant](../how-to/configure-assistant.md) — turning it on / off.
