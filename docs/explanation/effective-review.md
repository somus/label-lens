# Effective Review: the audit log vs. current state

The `reviews` table is an append-only audit log. Every `a`, `r`, `1`-`9`, `x`, `s`, `n`, `u` press inserts a row — including the compensating row that `u` writes when you undo. Rows never get deleted, never get UPDATEd in place.

That gives you a clean provenance trail (`labellens export log`). But it means "the current state of this record" can't be read from the latest row alone — you have to skip undone rows + their compensation pairs.

`effective_reviews` is the SQL view that does that for you.

```sql
CREATE VIEW effective_reviews AS
SELECT r.* FROM reviews r
WHERE r.status != 'undone'
  AND r.id NOT IN (
    SELECT compensates_review_id FROM reviews
    WHERE compensates_review_id IS NOT NULL
  );
```

In plain English: keep every review row that isn't an undo marker AND wasn't itself undone.

## Why this matters

ADR 0007 makes the view the **single source of truth for "current Review entry"**. Every queue, every export, every stats aggregation reads from `effective_reviews`. Never re-derive "non-undone, non-compensated" inline — you'll get it wrong eventually.

Concretely:

- `pending` queue selects records with no row in `effective_reviews`. (Skipped records have a row in `effective_reviews` with `status = 'skipped'`, so they're excluded — see [skipped-state](./skipped-state.md).)
- `labellens export jsonl` reads `effective_reviews`, joins to the record, writes one row per reviewed record.
- The stats surface's totals are counts over `effective_reviews`.

## Two surfaces that read raw `reviews`

By design:

1. **The history strip** on the review screen — shows last 4-5 decisions including undones. Reviewers want to see what they just did, including the undo.
2. **`labellens export log`** — the audit trail. Reads raw `reviews` because every row is significant, including the undo markers.

Everything else: `effective_reviews`.

## A walked-through example

You press these keys for record `R`:

1. `a` → row 1: status=`accepted`, final_label=`food`.
2. `j j j` → navigate away.
3. (later) `k k k` → back to R.
4. `r` → picker opens, you pick `travel`.
5. → row 2: status=`relabeled`, final_label=`travel`, prev_label=`food`.
6. `u` → undoes the relabel.
7. → row 3: status=`undone`, compensates_review_id=2.

After all that, `effective_reviews` shows **row 1** as the current state of R. Row 2 is compensated by row 3, so it's filtered out. Row 3 is `status='undone'`, also filtered.

The history strip on screen shows: row 1 (accept), row 2 (relabel), row 3 (undo). All three. The audit log export includes all three.

Stats? Reads `effective_reviews`. Counts R as accepted, food. The relabel is invisible to stats because it's not the current state — that's by design.

## Why the bulk export helper

For exports that touch many records, `effective_reviews` joined to `records` for every row is fine — SQLite is fast and the view is indexed. But the export code has `latestEffectiveByRecord` (in `src/store/queries.ts`) that pulls all current-state rows in one query rather than N round trips. Use it when writing new exporters. The JSONL exporter already does.

## Related

- [ADR 0007](../adr/0007-effective-review-entry.md) — the formal decision record.
- [Skipped state](./skipped-state.md) — why skipped is in `effective_reviews` (so `pending` excludes it).
- [Assistant audit](./assistant-audit.md) — how `source_of_truth` flows through `effective_reviews`.
