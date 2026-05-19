# How-to: work with queues

A queue is just a saved filter over your records. Switching between queues is fast — cursors are memoised per queue, so re-entering resumes at the last position.

See [Reference: queues](../reference/queues.md) for the full grammar.

<a href="../media/queue-skipped.webm">
  <img src="../media/queue-skipped.gif" alt="Switching queues and revisiting skipped records" width="800">
</a>

## Quick patterns

### Find low-confidence records

```
[       # cycle to low-confidence queue
```

Or open the queue overlay (`Q`) and pick `low-confidence`. Records sort by `primary_confidence` ASC.

To tune what "low confidence" means for your dataset:

```bash
labellens config set signals.lowConfidence.default 0.6
labellens config set signals.lowConfidence.bySource "regex.*=0.3"
```

Each call rewrites `labellens.config.json` and recomputes the `by-issue:low_confidence` queue + `smart-pending` ordering against the new thresholds. See [config reference → signals](../reference/config.md#signals) for resolution rules.

### Find records where two models disagree

```
[       # cycle to disagreements queue
```

Only surfaces records whose `predictions[]` array contains ≥ 2 distinct labels.

### Focus a single source

Suppose your JSONL has predictions tagged `source: "llm:gpt-4"` and `source: "regex"`. To review only the regex predictions:

```
:           # open palette
:by-source regex
```

`Enter` switches to `by-source:regex`.

### Triage a specific correction pattern

You opened stats (`t`), saw `food → utility, 14 records`, and want to inspect them. Press `Enter` on that row — drills into `by-correction:food:utility`.

## Power user: `where:` predicates

The palette accepts free-form SQL-ish predicates over indexed columns:

```
:queue where: confidence < 0.3 and source = 'llm:gpt-4'
:queue where: final_label != prev_label and prev_label = 'ENTRY_START'
:queue where: issue_type in ('source_disagreement', 'low_confidence')
```

Operators: `=` `!=` `<` `<=` `>` `>=` `in`. Combine with `and` / `or`; parens override precedence.

Columns: `status`, `final_label`, `prev_label`, `source`, `confidence`, `reason`, `issue_type`.

Unknown columns/operators throw a parse error. Values bind through drizzle interpolation — no SQL injection risk.

## Mark-and-batch (V1)

The `marked` tag is additive — `m` toggles it without changing review state. Use it to assemble an ad-hoc batch:

```
j j j m            # mark 3rd record
j m                # mark next
[                  # cycle to marked queue
```

You see only marked records. Process them. Then jump back with `]`.

V1 will add `:bulk relabel <label>` etc. against the marked set; in MVP the manual loop is the workflow.

## Save your place across launches

Cursor positions don't persist across `labellens` invocations, but the underlying queue queries are deterministic. Re-launch → `[` → you're back where you left off in low-confidence.

For longer sessions, mark the record you stopped at and use `:by-tag marked` (V1) or filter manually:

```
:queue where: id = '<sha256-prefix>'
```

## Smart-pending mode

Set in config:

```jsonc
"navigation": { "smartNext": true }
```

When the queue is `pending`, `j` / `k` walk a signal-weighted cursor instead of document order: low-confidence + disagreement + flagged records bubble up.

The status bar shows `▸ smart` while active. `shift+j` / `shift+k` always navigate document order regardless of mode, as an escape hatch.

Turn off by setting back to `false` and re-launching.
