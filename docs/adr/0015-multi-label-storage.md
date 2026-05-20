# Multi-label storage: JSON array text in `final_label`

- **Status:** Accepted
- **Date:** 2026-05-20

PRD #105 adds a `task: "multi-label"` mode where a Record's Annotation is a *set* of configured labels (zero-or-more). Single-label tasks already store the chosen label as bare text in `reviews.final_label` / `records.primary_label`. Multi-label uses the same columns and encodes the set as a JSON array string (e.g. `'["spam","toxicity"]'`). No new tables; no schema migration.

## Decision

1. `final_label` and `primary_label` carry a JSON array string under `task: "multi-label"`. The encode/decode pair lives in [`src/labels/label-set.ts`](../../src/labels/label-set.ts).
2. The in-progress reviewer set (toggled via digits `1`–`9`, per-label keys, or the multi-label picker) is held on `AppContext.multiLabelDraft` and **never** written to the DB until commit. `record.next` / `record.prev` clear it.
3. Set normalization (drop unknowns, dedupe, sort into config order) runs at **ingest** (`src/ingest/ingest.ts`) and at any reducer that receives an externally-sourced set (assistant `streamEnd` in `src/overlay/assistant.ts`). Commit paths assume the set is already canonical.

## Why JSON array text, not a join table

A `record_labels(record_id, label, source)` join table would be the textbook shape. We rejected it because:

- **`effective_reviews` ([ADR 0007](./0007-effective-review-entry.md)) stays untouched.** "Current state" is still one row per (record, latest non-undone, non-compensated). A join table would force every "latest current label(s)" read through `effective_reviews ⋈ record_labels`, with `compensates_review_id` semantics duplicated on the join side.
- **Audit and undo stay single-row.** Inserting one review row and a variable number of join rows in lockstep — and reversing both on `record.undo` — adds atomicity surface area and bugs.
- **Set-membership queries are a small leaf.** Only the `by-label:<l>` queue needs "does this set contain `<l>`", handled with `json_each` + `EXISTS` in [`src/store/queues/predicates.ts`](../../src/store/queues/predicates.ts). A `CASE WHEN json_valid ... ELSE '[]'` guard lets the same predicate run safely against single-label scalar text.
- **Export is symmetric.** JSONL emits the array as-is; CSV joins with `;` (see [`src/export/jsonl.ts`](../../src/export/jsonl.ts), [`src/export/csv.ts`](../../src/export/csv.ts)).

## Why the draft is session-local

The draft is a transient editor state, not a Review. Persisting it would either:

- Break the invariant that the DB only holds committed decisions (a partial multi-label toggle is a "half-decision"), or
- Require a new table whose only consumer is one screen.

Session-local matches the single-label flow — pressing a digit, then `n` to advance without `enter`, discards the choice. Restart wipes the draft intentionally; the reviewer reopens the record and starts from the predicted set.

## Why normalize at ingest, not at commit

Normalizing at ingest means the predicted set is canonical by the time the reviewer ever sees it. Consequences:

- Commit-path code doesn't re-validate against `config.labels` (single source of canonicalization).
- `toggleMultiLabelDraft` ([`src/actions/record/decisions.ts`](../../src/actions/record/decisions.ts)) still filters the seed against the live config — belt-and-braces for the case where config labels were removed between ingest and review.
- `findUnknownLabels` decodes JSON arrays so the boot-time guard reports unknown set members the same way it reports unknown scalars.

The trade-off: re-ingest after a config edit is the only way to re-canonicalize predicted sets. Smart re-ingest ([ADR 0002](./0002-smart-reingest.md)) handles this.

## Consequences

- `reviews.final_label` is `null` for `rejected`/`skipped`, bare text for single-label, JSON array text for multi-label. Type is `TEXT` either way; callers know which by `config.task`.
- `labelSetsEqual` ([`src/labels/label-set.ts`](../../src/labels/label-set.ts)) is order-insensitive but production sets are always config-ordered, so `===` of encoded strings is also a valid equality check when both sides come from the same canonicalization path.
- A future migration to a join table would be a superseding ADR + a one-shot rewrite of `final_label` JSON into rows.
