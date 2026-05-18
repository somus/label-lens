# Reference: queues

LabelLens organises records into named queues. A queue is a SQL query over indexed columns; switching is a cursor swap, not a full re-query of the DB. Each cursor is memoised per-queue in the app context so re-entering resumes at the last position.

## Switching queues

| From | How |
|---|---|
| Review screen | `[` / `]` cycle the built-ins. `Q` (shift+q) opens the queue overlay with live counts. |
| Palette | `:queue <name>` switches to a named queue. `:by-source llm:gpt-4`, `:where: confidence < 0.3`, etc. |
| Stats | Pressing `Enter` on any aggregation row drills into the corresponding queue. |

## Built-in queues

| Name | Definition |
|---|---|
| `pending` | Untouched records (no effective review). Excludes `skipped` per ADR 0003. The default queue on launch. |
| `skipped` | Latest effective review status = `skipped`. |
| `low-confidence` | Unreviewed, ordered by `primary_confidence` ASC. NULL confidences sort last. |
| `disagreements` | Unreviewed records whose `predictions[]` carry ≥ 2 distinct labels. |
| `flagged` | Records with any row in the `issues` table (imported via JSONL `issues[]` + computed signals — see below). |
| `marked` | Records tagged `marked` (toggled with `m`). Additive; survives review state. |

## Parametric queue factories

Open via palette (`:`) or `?`-help.

### `by-source:<s>`

Records whose `primary_source` equals `<s>`. Source strings may contain colons; the rest of the queue id is reassembled:

```
by-source:llm:gpt-4         → primary_source = "llm:gpt-4"
by-source:regex             → primary_source = "regex"
```

Drilldown target from the stats screen's "By source" rows.

### `by-reason:<r>`

`primary_reason = <r>`. Useful when the upstream pipeline tagged predictions with reason codes (`out_of_vocab`, `low_signal`, etc.).

### `by-label:<l>`

Effective `final_label` (if reviewed) or `primary_label` (if not). Reviewer-set labels take precedence over predictions.

### `by-issue:<t>`

`EXISTS (issues WHERE type = <t>)`. Built-in issue types:

- `low_confidence` — primary confidence below the threshold (default 0.5).
- `source_disagreement` — multiple sources predict different labels.
- `exact_duplicate` — text identical to another record in the dataset.

Imported issues from the JSONL `issues[]` array land here too (e.g. Cleanlab-style flags).

### `by-correction:<from>:<to>`

Latest effective review flipped `<from>` → `<to>`. Drilldown target from "Corrections" rows on the stats screen.

Split on the **last** colon, so colon-namespaced from-labels survive:

```
by-correction:policy:spam:ham  → from="policy:spam", to="ham"
```

The to-label cannot itself contain a colon.

## Power-user: `where:<expr>`

Free-form predicate via the palette:

```
:queue where: source = 'llm:gpt-4' and confidence < 0.3
:queue where: final_label != prev_label and prev_label = 'ENTRY_START'
:queue where: issue_type in ('source_disagreement', 'low_confidence')
```

### Columns

| Column | Resolves to |
|---|---|
| `status` | Latest `reviews.status` |
| `final_label` | Latest `reviews.final_label` |
| `prev_label` | Latest `reviews.prev_label` |
| `source` | `predictions.source` (primary) |
| `confidence` | `predictions.confidence` (primary) |
| `reason` | `predictions.reason` (primary) |
| `issue_type` | `issues.type` (compiles to `EXISTS` subquery) |

### Operators

`=`, `!=`, `<`, `<=`, `>`, `>=`, `in`. Combine with `and` / `or`; precedence: `and` > `or`; parens override.

### Safety

The parser is recursive-descent over a strict whitelist. Values bind via drizzle `${value}` interpolation — no string concatenation, no SQL injection. Unknown columns or operators throw `WhereParseError`.

## Smart-pending (optional)

When `navigation.smartNext = true`, navigating `pending` opens a sibling cursor (`smart-pending`) that orders records by a composite signal score (low confidence + disagreement + flagged) instead of document order. `shift+j` / `shift+k` always navigate document order regardless of mode, as an escape hatch.

The status bar surfaces `▸ smart` while the mode is active.

## Effective state

Every built-in queue and parametric factory reads `effective_reviews`, never raw `reviews`, for current-state predicates (ADR 0007). The `reviews` table is the audit log; the view filters out undone and compensated rows.

Exception: the history strip (last N decisions on the review screen) and review-log export read raw `reviews` because they're audit surfaces by design.

## Counts

The queue overlay shows live counts per built-in via `queueCount` in `src/store/queues/queue-counts.ts`. Counts respect the same `effective_reviews` rule.

## Adding a queue

Internal: see [`src/store/queues/`](../../src/store/queues/). One file per queue + registration in `registry.ts`. Always read `effective_reviews`; never re-derive the "non-undone, non-compensated" predicate inline.
