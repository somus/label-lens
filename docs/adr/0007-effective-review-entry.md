# Effective Review entry: a single source of truth for "current" state

- **Status:** Accepted
- **Date:** 2026-05-10

The `reviews` table is insert-only. A Record's *effective* Review entry — the one that determines its current Review state — is the most recent row that is **(a)** not status='undone' and **(b)** not referenced by another row's `compensates_review_id`. Slice 2 introduced this rule when it added undo (PRD §11.4). Slice 11 will read it for assistant-aware Source of truth (ADR 0004).

The rule is encoded once as a SQL view, `effective_reviews`, and reused everywhere reviews are read for "current" state. No callsite recomputes the predicate.

```sql
CREATE VIEW effective_reviews AS
SELECT r.* FROM reviews r
WHERE r.status != 'undone'
  AND r.id NOT IN (
    SELECT compensates_review_id FROM reviews
    WHERE compensates_review_id IS NOT NULL
  );
```

## Why a view, not a shared predicate

Five callsites need this filter today: `currentReview`, `latestReview`, `progressCounts`, the `pending` queue, and the `skipped` queue. They differ in shape (per-record latest, dataset-latest, GROUP BY, NOT EXISTS / EXISTS) but agree on the predicate. A SQL view collapses the predicate into one definition; each callsite becomes a query against `effective_reviews` rather than a hand-built filter. A TS predicate helper would still leave each callsite responsible for splicing it into the right place — same risk class as today, just less typing.

The view is read-only and stateless; SQLite optimizes it transparently in most query plans.

## Consequences

- `currentReview(recordId)` = `SELECT … FROM effective_reviews WHERE record_id = ? ORDER BY id DESC LIMIT 1`.
- `latestReview()` = `SELECT … FROM effective_reviews ORDER BY id DESC LIMIT 1`.
- `progressCounts()` per-record latest = subquery against `effective_reviews`; records with no row are pending.
- `pending` queue's WHERE clause = `NOT EXISTS (SELECT 1 FROM effective_reviews WHERE record_id = records.id)`.
- `skipped` queue's WHERE clause = `EXISTS (SELECT 1 FROM effective_reviews WHERE record_id = records.id AND status = 'skipped')`.
- `recentReviews(limit)` is **not** scoped to the view — the history strip intentionally surfaces undo events as distinct rows. It uses a NOT-compensated filter directly against `reviews` (still single-purpose, narrow scope).
- A new query that touches "current Review state" should query `effective_reviews`, never `reviews` directly, unless it is intentionally inspecting the audit log (history view, undo plumbing, debugging).
- Drizzle declares the view via `sqliteView(...).existing()`; the SQL DDL lives in a migration file (drizzle-kit does not emit views with derived predicates).
