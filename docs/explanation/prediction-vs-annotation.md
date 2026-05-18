# Prediction vs annotation

LabelLens models two distinct kinds of labels — keep them separate in your head and you'll understand every other concept faster.

## Two kinds of labels

**Prediction**: a label produced by a machine. Could be an LLM, a regex rule, a weak classifier, a vendor API. Predictions land in LabelLens via the JSONL's `prediction` (or `predictions[]`) field at ingest. They're **proposals** — never the source of truth.

**Annotation**: a label produced by a human reviewer (you). Annotations land via `a` / `r` / `1`-`9` / `i`-Enter — every key on the review screen that commits a decision. They're authoritative.

A single record can carry many predictions (multi-source pipelines) and many reviews over time (you change your mind, you `u`ndo, you relabel). LabelLens stores all of them.

## Don't say "label" alone

When you read "label" in isolation, it's ambiguous. LabelLens documentation and code consistently distinguishes:

- "the predicted **label**" or "the annotation's **final_label**" — the actual string value (`food`, `SECTION_HEADER`).
- "the **prediction**" — the row in `predictions` (label + source + confidence + reason).
- "the **annotation**" — the row in `reviews` (status + final_label + prev_label + source_of_truth + reviewed_at).

If you ever feel like a doc page is unclear, it's probably because someone said "label" where they meant "prediction" or "annotation". That's a documentation bug — please file it.

## Why it matters

This model lets you:

- **Audit provenance**: every annotation knows which prediction it overrode (`prev_label`).
- **Measure model quality**: stats screen's "By source" rows compute per-source accept rates because the prediction's `source` survives.
- **Reproduce decisions**: the audit log (`labellens export log`) records every annotation including the ones you undid.
- **Avoid contamination**: ADR 0004's `human+assistant` audit tag exists because reading an LLM's suggestion is influence even when you reject it.

## When the LLM assistant suggests a label

The assistant produces what looks like a third kind of label: a suggestion. It's actually a **prediction** that wasn't in the source JSONL — produced on-demand, cached in `assistant_queries` by `(record_id, prompt_hash)`. When you accept the suggestion with `Enter`, that becomes an annotation tagged `source_of_truth = "human+assistant"`. The original prediction (whatever the source JSONL had) is preserved.

If you dismiss the suggestion with `Esc` but commit any other decision for that record in the same focus session, the annotation is **still** tagged `human+assistant`. See [assistant-audit](./assistant-audit.md) for why.

## What the source data is

Your JSONL is the source of truth for **records** (the text being labeled), not for annotations. LabelLens never writes back to your JSONL. Annotations live only in `.labellens/state.db`. Exports go to a separate file via `labellens export`. This separation lets you re-ingest the source dataset on edit without losing review work — see ADR 0002 (smart re-ingest).
