# `where:` DSL excludes orphans by default

- **Status:** Accepted
- **Date:** 2026-05-19

CONTEXT.md is unambiguous: "every built-in queue except `orphans` excludes orphan records." But the `where:` DSL — the power-user escape hatch — historically required the author to remember `and orphan = 0` on every expression. A predicate like `where:status = 'accepted'` silently included orphans, contradicting both the built-in defaults and the reviewer's mental model.

## Decision

`parseWhere(expr)` wraps the compiled predicate with `nonOrphan()` by default. To opt back in, prefix the expression with `include-orphans:`:

```
:queue where: status = 'accepted'                  → orphans excluded (default)
:queue where: include-orphans: status = 'accepted' → orphans included
:queue where: orphan = 0                           → unchanged
:queue where: include-orphans: orphan = 1          → lists orphans only
```

The prefix is detected before tokenization (regex `^\s*include-orphans:\s*`), stripped, and a flag is threaded into the wrap step. The original expression is preserved verbatim in the queue id.

## Why default-exclude over status quo

- Matches every built-in queue. Two surfaces shared the rule; one obeyed it, one didn't.
- New `where:` authors stop tripping over a footgun their first day. The escape hatch is one prefix, not 12 characters of boilerplate.
- The composable `nonOrphan()` predicate (companion refactor, issue #75) gives the DSL the same composition seam every other queue uses.

## Consequences

- The `orphan` column remains exposed in the DSL but is now a dead letter without `include-orphans:` — `where:orphan = 1` returns empty because `orphan = 1 AND orphan = 0` is unsatisfiable.
- `where-parser.test.ts` test for `orphan = 1` was rewritten to use the prefix. No other built-in test was affected (none asserted orphan-inclusive `where:` semantics).
- The `predicateQueue(...)` builder API (used by the visual predicate builder) does **not** wrap — only the DSL boundary `parseWhere` does. The builder explicitly hides `orphan` (`BUILDER_COLUMNS`), so it can't produce orphan-bearing predicates anyway.
