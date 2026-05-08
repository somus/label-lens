# `skipped` is a distinct review state, not a flavor of `pending`

Review states are mutually exclusive: `pending`, `accepted`, `relabeled`, `rejected`, `skipped`. **`skipped` is its own state** — it does not appear in the `pending` queue, and it is not counted as `pending` in progress stats. Skipped records live in a dedicated `skipped` queue and are surfaced separately on the stats screen.

The PRD as originally drafted said skipped was "counted as reviewed" yet "appears in the pending queue at the bottom." Those two statements break the invariant `reviewed + pending = total`, which is the core sanity check on the progress display. Forcing `skipped` to be its own state preserves the invariant and gives reviewers an honest signal about how many records they actively chose to defer.

## Consequences

- Progress display: `Reviewed: A+R+J / Total · Skipped: K · Pending: P` (four buckets, no overlap).
- Default JSONL export still excludes `skipped` records (PRD §11.4 unchanged on that point).
- Queue list (§10.3) gains a `skipped` queue alongside `pending`. Reviewers revisit deferred records there explicitly rather than at the tail of pending.
- Downstream consumers of the review log can rely on `status` enum being meaningful — `skipped` is not a synonym for unreviewed.
