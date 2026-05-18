# How-to: export your reviewed dataset

`labellens export` writes the current state of your reviews to disk. Source JSONL is never modified.

<a href="../media/export-stats.webm">
  <img src="../media/export-stats.gif" alt="Exporting and previewing a LabelLens stats report" width="800">
</a>

## Quick reference

```sh
labellens export jsonl                       # one row per reviewed record
labellens export csv
labellens export stats                       # Markdown summary
labellens export log                         # full audit trail (every review row)
labellens export jsonl --output custom.jsonl # override config's output base
```

See [Reference: output schemas](../reference/output-schema.md) for the exact field set per format.

## "Reviewed" means what exactly

Exports read the `effective_reviews` view (ADR 0007). That is:

- The latest review row per record, ignoring `undone` rows and their compensation pairs.
- Includes `skipped` records (with `final_label: null`).
- **Excludes** records you never touched. If you want pending records in the export too, that's V1 — file an issue.

## Stats first

Before exporting, run `labellens export stats` to sanity-check:

```sh
labellens export stats --output reviewed
```

The Markdown report shows total reviewed, accuracy by source, top corrections, and imported issue counts. Diff against your dataset spec — if reviewed/total is off, you missed records.

## Round-trip the audit trail

For provenance audits ("did an LLM ever influence this dataset?"):

```sh
labellens export log --output audit
```

Every review row (including `undone` and compensating entries) lands. Filter to `source_of_truth = "human+assistant"` to find records the LLM assistant touched (ADR 0004 — viewing counts, not just acceptance).

```sh
jq 'select(.source_of_truth == "human+assistant")' audit.review-log.jsonl | wc -l
```

## Re-run idempotent

`labellens export` overwrites the output path. There's no append mode. Re-export anytime to get fresh state.

## Schema stability

Field names in JSONL exports are stable across versions. New fields may appear in future versions but existing ones don't get renamed without a major bump. Track changes via [CHANGELOG.md](../../CHANGELOG.md) (when it exists; for now via git log).
