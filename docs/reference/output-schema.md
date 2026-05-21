# Reference: output schemas

Shapes emitted by `labellens export`. All paths default to `output.path` from `labellens.config.json`; override the base with `--output <path>`.

## `labellens export jsonl`

One row per reviewed record. Reads `effective_reviews` — only the current state per record (no undone / compensated rows).

```jsonl
{
  "id": "<sha256 of text + context>",
  "text": "Lunch at Zomato",
  "context_before": null,
  "context_after": null,
  "final_label": "food",
  "prev_label": "shopping",
  "status": "relabeled",
  "source_of_truth": "human+assistant",
  "reviewed_at": "2026-05-18T14:23:01Z",
  "note": null,
  "predictions": [
    { "label": "shopping", "confidence": 0.6, "source": "llm:gpt-4", "reason": null }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable record id (content hash by default, ADR 0001). |
| `text` | string | Candidate text from the source JSONL. |
| `context_before` / `context_after` | string \| null | If the source had them. |
| `label` (configurable via `output.fieldOverrides.label`; storage column is `final_label`) | string \| null \| string[] | The annotation. Null when status is `rejected` or `skipped`. For `task: "multi-label"`, emitted as a JSON array (`["spam","toxicity"]`) of the committed set. |
| `prev_label` | string \| null | The label this overrode (typically the predicted label on relabel). For multi-label tasks, this is the encoded JSON-array text of the previous set. |
| `status` | `accepted` \| `relabeled` \| `rejected` \| `skipped` | Latest effective state. |
| `source_of_truth` | `human` \| `human+assistant` | `human+assistant` whenever the assistant panel was viewed for this record (ADR 0004). |
| `reviewed_at` | ISO 8601 | UTC timestamp. |
| `note` | string \| null | Reviewer note from the `n` overlay. |
| `predictions` | array | The original prediction rows. Preserved verbatim. |

Records you skipped are included with `status: "skipped"` and `final_label: null`. Records you never touched are **omitted** — only effective reviews land in the export.

### Multi-label JSONL

For `task: "multi-label"` (see [task types](../explanation/task-types.md), shipped in #105):

- Accepted/relabeled rows emit `label` as a JSON array of strings in the order defined by the `labels` config array (canonical configured-label order), e.g. `"label": ["spam","toxicity"]`.
- Rejected/skipped rows (when included via `--include-rejected` / `--include-skipped`) keep `label: null`, same as single-label.
- `output.fieldOverrides.label` renames the emitted field for both task shapes.

Export aborts with a user-visible error if any included accepted/relabeled row has:

- an empty stored set (`[]`),
- a stored value that is not valid JSON, not a JSON array, or contains a non-string element.

The error names the offending record id. No coercion is attempted — malformed storage is treated as a bug in upstream commit/migration code.

## `labellens export csv`

Same fields as JSONL, flattened. Nested fields (`predictions`) are JSON-stringified into a single column.

| Column | Type |
|---|---|
| `id` | string |
| `text` | string |
| `context_before` | string |
| `context_after` | string |
| `final_label` | string |
| `prev_label` | string |
| `status` | string |
| `source_of_truth` | string |
| `reviewed_at` | string (ISO 8601) |
| `note` | string |
| `predictions_json` | string (JSON-encoded array) |

CSV is quoted per RFC 4180. Embedded quotes are doubled.

For `task: "multi-label"` (shipped in #105), the `label` column joins the committed set with `output.csvMultiLabelSeparator` (default `;`) — e.g. `spam;toxicity`. Set a different separator if your labels contain a literal `;`:

```jsonc
"output": { "path": "reviewed.csv", "format": "csv", "csvMultiLabelSeparator": "|" }
```

Rejected/skipped rows (when included) emit a blank label cell, same as single-label.

CSV export aborts with a user-visible error if any included accepted/relabeled multi-label row has:

- an empty stored set,
- a malformed stored value (non-JSON, non-array, or non-string elements),
- a label value that contains the configured separator (would produce ambiguous output — pick a different `csvMultiLabelSeparator`).

The error names the offending record id and, for the separator collision, the offending label.

## `labellens export stats`

Markdown summary of the review session.

```markdown
# LabelLens stats — transactions.jsonl

**Progress**: 142 / 200 reviewed (71%) · 3 skipped · 55 pending

## By source
| Source       | Reviewed | Accepted | Relabeled | Rejected | Accuracy |
|--------------|----------|----------|-----------|----------|----------|
| llm:gpt-4    |      120 |       95 |        22 |        3 |     79%  |
| regex        |       22 |       18 |         4 |        0 |     82%  |

## Corrections (top 10)
| From       | To         | Count |
|------------|------------|-------|
| food       | utility    |    14 |
| shopping   | utility    |     8 |
…

## Reasons
| Reason         | Count |
|----------------|-------|
| out_of_vocab   |    19 |
| low_signal     |     4 |

## Imported issues
| Type                | Count |
|---------------------|-------|
| source_disagreement |    11 |
| low_confidence      |     6 |
| exact_duplicate     |     3 |
```

Use as a progress report or a paste-into-PR summary.

## `labellens export log`

Full review audit trail. Reads raw `reviews` table — every row, including undone and compensated.

```jsonl
{
  "id": 142,
  "record_id": "<sha256>",
  "status": "relabeled",
  "final_label": "utility",
  "prev_label": "shopping",
  "reviewed_at": "2026-05-18T14:23:01Z",
  "source_of_truth": "human+assistant",
  "compensates_review_id": null,
  "note": null
}
{
  "id": 143,
  "record_id": "<sha256>",
  "status": "undone",
  ...
  "compensates_review_id": 142
}
```

| Field | Meaning |
|---|---|
| `id` | Monotonic review id. |
| `record_id` | Foreign key to `records.id`. |
| `status` | Includes `undone` (the compensating row written by `u`). |
| `compensates_review_id` | When set, this row negates the referenced review id. |

Use this for replay, dataset provenance audits, or contamination-detection workflows where you need to know which records ever saw the LLM assistant ([ADR 0004](../explanation/assistant-audit.md)).
