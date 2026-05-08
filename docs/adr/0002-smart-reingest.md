# Re-ingest distinguishes text changes from prediction-only changes

When the source file changes, LabelLens diffs the new ingest against the existing `state.db` keyed on the content-hash IDs from ADR 0001 and offers three paths:

1. **All IDs match, only `predictions[]` changed** → refresh predictions in place; reviews and annotations are kept untouched.
2. **Some IDs no longer match (text or context changed)** → those records are treated as new; the matching old records become orphans (preserved, not destroyed). User confirms before commit.
3. **Mixed** → prompt per-bucket so the user can confirm prediction-refresh independently from the orphan set.

The PRD as originally drafted (§13) treated every source change as a fresh re-ingest with `.labellens/` backed up to `.labellens.bak/`. That was rejected: a common workflow is "review 500 records → upgrade the labeling LLM → re-run on the same texts," and uniform fresh-ingest would discard 500 reviews even though every ID still matches. The smart path is cheap because IDs are already deterministic and the diff is local.

## Consequences

- Re-ingest UI must show counts per bucket ("482 records: predictions changed only · 18 records: text changed → orphan · 6 new records") before committing.
- Pure-orphan operations (bucket 2 with no bucket 1 changes) still offer the legacy "fresh + backup" path as an escape hatch.
- The smart-merge path described in PRD §18 V1 ("preserve reviews across edits") remains V1 work — that path tries to *rebind* orphans, while this ADR only *avoids creating them when text didn't change*.
