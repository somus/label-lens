# Skipped is its own state

When you press `s`, the record is **skipped** — not deferred, not bookmarked, not "kind of pending". Skipped is a distinct review state with its own queue (`skipped`) and its own status column value (`reviews.status = 'skipped'`).

## Why a separate state?

The intuitive design is "skip = come back later" → record stays in the `pending` queue. We rejected that for two reasons:

1. **The reviewer told you they don't want to deal with it now.** Surfacing it again next time you press `j` violates that signal. Worse: in a smart-next world (signal-weighted ordering), a skipped record might bubble back to the top because nothing else changed about it.
2. **The audit log needs to record the skip.** If skipping just left the record pending, there's no way to distinguish "I never saw this record" from "I saw it and walked away". Provenance suffers.

ADR 0003 captures the decision. Consequences:

- `pending` queue **excludes** skipped records. They're gone from the default loop.
- `skipped` queue surfaces only records you skipped. Switch via `[`/`]` or `:queue skipped`.
- Coming back to a skipped record is an explicit action — you have to switch queues. That's the right friction level for "later me will think about this".
- The progress strip splits Reviewed (accepted + relabeled + rejected) from Skipped, so totals stay honest.

## What if I change my mind?

From the `skipped` queue, press any decision key — `a`, `r`, a digit, `x`. The new review row supersedes the skip via the `effective_reviews` view (ADR 0007). The skip stays in the audit log; the effective state flips.

## What if I want skipped records back in pending?

Don't. The whole point is that skipping is a real signal. If you skipped records by mistake, walk the `skipped` queue and act on them. If you skipped a class of records because the labeling task was poorly scoped, fix the task first and revisit.

If you genuinely need both surfaced together, use a `where:` predicate via the palette:

```
:queue where: status in ('skipped', '') or status is null
```

(Not all of those operators ship today — file an issue if you hit a real need.)

## Related

- [ADR 0003](../adr/0003-skipped-distinct-state.md) — the formal decision record.
- [Effective Review](./effective-review.md) — how the audit log + effective view interact.
