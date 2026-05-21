# Review task types

LabelLens reviews pre-labeled records. It is not a blank annotation tool: the input already contains one or more machine predictions, and the reviewer produces the final human annotation.

Read [Prediction vs annotation](./prediction-vs-annotation.md) first if those terms are new. In short: a prediction is the model, rule, or LLM proposal from the source data; an annotation is the human-reviewed result stored in `.labellens/state.db`.

<a href="../media/hero.webm">
  <img src="../media/hero.gif" alt="LabelLens review loop — accept, relabel, skip" width="800">
</a>

## Which task should I use?

| You have | Use | Status |
|---|---|---|
| One category per row, such as topic, intent, merchant type, or sentiment | `classification` | Supported |
| One structural label per line or document segment, where nearby lines matter | `boundary` | Supported |
| Several independent labels can be true for the same row | `multi-label` | Supported |
| Structured fields to correct, such as names, dates, or amounts | `extraction` | Supported |
| Two outputs to compare or rank | Pairwise / preference | Planned later |
| Character spans to add, delete, or resize | NER / span review | Planned later |

## Single-label classification

Use `classification` when each record should end with exactly one label value.

Good fits:

- Transaction category review: `food`, `travel`, `rent`, `salary`.
- Support intent review: `refund`, `bug`, `pricing`, `account`.
- Document type review: `invoice`, `resume`, `contract`, `receipt`.

Minimal config shape:

```jsonc
{
  "task": "classification",
  "labels": ["food", "travel", "rent", "salary", "other"],
  "input": {
    "path": "./data.jsonl",
    "format": "jsonl",
    "fields": {
      "text": "text",
      "prediction": "prediction",
      "confidence": "confidence",
      "source": "source"
    }
  }
}
```

The review action always produces one current annotation for the record: accept the prediction, relabel to a different value, reject, or skip. If your row can legitimately need both `billing` and `urgent`, do not force that into `classification` unless your upstream data has already turned combinations into single values like `billing+urgent`.

## Boundary review

<a href="../media/boundary-review.webm">
  <img src="../media/boundary-review.gif" alt="Boundary review with document context and doc view" width="800">
</a>

Use `boundary` when the label describes a line or segment's role inside a larger document. The key difference from ordinary classification is context: a line like `Senior Engineer - Acme` is hard to classify alone, but clear when shown between a section heading and bullet lines.

Common label sets:

- Resume parsing: `SECTION_HEADER`, `ENTRY_START`, `CONTINUATION`, `NOISE`.
- Chat or transcript segmentation: `TURN_START`, `CONTINUATION`, `TOPIC_HEADER`, `NOISE`.
- Invoice or statement parsing: `HEADER`, `LINE_ITEM_START`, `LINE_ITEM_CONTINUATION`, `FOOTER`.

Minimal config shape:

```jsonc
{
  "task": "boundary",
  "labels": ["SECTION_HEADER", "ENTRY_START", "CONTINUATION", "NOISE"],
  "boundary": {
    "documentField": "document_id",
    "contextLines": 3
  },
  "input": {
    "path": "./lines.jsonl",
    "format": "jsonl",
    "fields": {
      "text": "text",
      "prediction": "prediction",
      "confidence": "confidence",
      "source": "source",
      "context_before": "context_before",
      "context_after": "context_after"
    }
  }
}
```

Boundary records should carry a document id, usually as top-level `document_id` or `meta.document_id`. LabelLens uses it for the `g d` document view, which lets you inspect the whole document without changing the active queue cursor.

The `context_before` and `context_after` fields are optional but strongly recommended. `labellens init` recommends `task: "boundary"` when more than half the sampled rows have context fields.

## Multiple prediction sources

Multiple prediction sources are not a separate task type. They work with both supported tasks through a `predictions[]` array:

```jsonl
{"text":"Uber ride to airport","predictions":[{"label":"travel","confidence":0.82,"source":"llm:gpt-4"},{"label":"other","confidence":0.55,"source":"regex.rules"}]}
```

Each entry is stored as a prediction. The highest-confidence prediction becomes the primary prediction, and records with conflicting predicted labels appear in the `disagreements` queue. Exports still use the human annotation as the reviewed result.

## Multi-label classification

<a href="../media/multi-label.webm">
  <img src="../media/multi-label.gif" alt="Multi-label chip rail with digit toggle and picker overlay" width="800">
</a>

Use `multi-label` when multiple labels can be true for the same row at once — content moderation, multi-intent triage, multi-topic tagging.

Good fits:

- Content moderation: a comment can be both `spam` and `toxicity`.
- Multi-intent support tickets: `refund` + `account-access`.
- Multi-topic tagging: an article can be `politics` and `economy`.

Minimal config shape:

```jsonc
{
  "task": "multi-label",
  "labels": ["spam", "toxicity", "promotion"],
  "input": {
    "path": "./data.jsonl",
    "format": "jsonl",
    "fields": { "text": "text" }
  }
}
```

Predictions must supply label arrays:

```jsonl
{"text":"buy cheap stuff","predictions":[{"label":["spam","toxicity"],"confidence":0.9,"source":"modelA"}]}
```

Single-string Prediction labels under `task: "multi-label"` are invalid — the ingest pipeline drops that Prediction with a warning. Unknown labels are dropped, duplicates are deduped, and the resulting set is sorted by configured label order before storage. Both the primary Prediction set and committed Annotation set are persisted as canonical JSON array text in the existing `predictions.label` / `reviews.final_label` columns; no schema migration is required.

Review actions:

- `a` accepts the primary Prediction set verbatim.
- `1`–`9` (and configured per-label `key` shortcuts) toggle the label at that position in / out of an in-progress *draft set*, right on the chip rail. The first toggle on a fresh record seeds the draft from the primary Prediction set so keystrokes edit against the prediction, not against `{}`. Diff glyphs (`=` kept, `+` added, `-` removed) replace the predicted `◆` while the draft is active.
- `Enter` commits the draft set. Status follows the set comparison: `accepted` when the draft equals the primary Prediction set, `relabeled` when it differs. Empty draft is refused — use `x` (reject) for "no valid labels."
- `r` opens the multi-label picker overlay (full filter / search). Seeded from the current draft when one exists, otherwise from the primary Prediction set. `Space` toggles, `Enter` commits, `Esc` cancels.
- The Assistant (`i`) returns a complete suggested set; `Enter` commits the validated set with `human+assistant` audit semantics.

Effective Review and undo semantics keep working with one current Review per Record. The `by-label:<l>` queue matches Records whose current Review's set (or, for unreviewed Records, the primary Prediction set) contains `<l>`. Exports decode the set: JSONL emits `label` as `string[]`, CSV joins the set with `output.csvMultiLabelSeparator` (default `;`).

Bulk multi-label operations and exact-set / per-label set correction metrics are not in scope yet — basic totals / status / source stats remain available.

## Extraction review

Use `extraction` when each record carries a structured object the reviewer should correct field-by-field — names, dates, amounts, companies. Extraction is form-style structured-field correction only: no character spans, no offsets, no NER. #112 supports `string | null` field values; arrays, numbers, booleans, and nested objects are future work.

Good fits:

- Invoice extraction review: `vendor`, `invoice_number`, `total`, `due_date`.
- Receipt parsing review: `merchant`, `date`, `amount`, `currency`.
- Resume / form parsing review: `name`, `email`, `start_date`, `end_date`.

Minimal config shape:

```jsonc
{
  "task": "extraction",
  "labels": ["__placeholder__"],
  "extraction": {
    "fields": [
      { "name": "company", "type": "string", "required": true },
      { "name": "amount",  "type": "string", "required": false, "key": "amt" },
      { "name": "date",    "type": "string", "required": false }
    ]
  },
  "input": {
    "path": "./data.jsonl",
    "format": "jsonl",
    "fields": { "text": "text" }
  }
}
```

Per-field options:

- `name` (required) — canonical storage / export key and the editor label.
- `type` (required) — `"string"` only in #112.
- `required` (required) — when `true`, `accept` and form-commit refuse the row if this field is null or empty.
- `key` (optional) — source-JSON alias. When set, ingest reads the prediction object's `key` property; canonical storage still uses `name`.

Predictions must supply objects (not strings or arrays):

```jsonl
{"text":"Invoice from Acme for $100","predictions":[{"label":{"amt":"100","company":"Acme"},"source":"modelA"}]}
```

A non-object Prediction label under `task: "extraction"` is dropped with an ingest warning. Configured fields not present in the input become `null`. Source-JSON keys not declared in `extraction.fields` are preserved verbatim in the raw record and prediction.raw but never edited or exported as corrected fields. The canonical stored object follows configured field order.

Review actions:

- `a` accepts the primary Prediction object verbatim — refused (with a flash) if any required field is null/empty in that object.
- `r` opens the form overlay. The draft is pre-populated from the prior committed Review value if one exists, else from the primary Prediction object.
- Inside the form, `↑` / `↓` (or `k` / `j` under the vim preset) move focus between fields. `e` opens inline edit on the focused field; `Enter` while editing commits the typed value to the draft and exits edit; `Enter` without an in-flight edit commits the Review. `Esc` cancels an in-flight edit first, then closes the form.
- Status follows object equality with the primary Prediction object: `accepted` when equal, `relabeled` when different.
- Required-field validation also gates form-commit — the overlay refuses to commit a Review while any required field is null/empty.
- `x` (reject) writes `final_label: null`; `s` (skip) writes `status: "skipped"`. `u` (undo) reverses the most recent decision. Effective Review and `human+assistant` audit semantics are unchanged.
- `1`–`9` and per-label `key` shortcuts are intentionally disabled — they would commit a single string label, which is invalid for extraction. The flash directs the reviewer to `r`.
- The Assistant (`i`) returns a complete suggested object validated against `extraction.fields`. The provider-side schema constrains the tool's keys to configured field names; missing required fields and unknown keys abort the response. `Enter` commits the suggested object with `human+assistant` audit semantics.

Storage is canonical JSON object text reused in the existing `predictions.label`, `reviews.final_label`, and `reviews.prev_label` columns — no schema migration. Export decodes per `extraction.fields`: JSONL emits the corrected object directly in `label`, CSV JSON-stringifies it into the same column (rejected/skipped rows remain `label: null` / blank as in other tasks). Missing required fields or malformed stored values abort the export with the offending record id.

`by-label:<l>` is not meaningful for extraction and matches no rows; per-field stats, per-field queues, field-level statuses, and other advanced extraction analytics are deferred.

## Planned task types

Pairwise / preference review will compare two or more candidate outputs and record a preference or winner.

NER / span review is intentionally deferred. Terminal span editing needs precise insertion, deletion, and offset repair, which is a different interaction model from the current record-level review loop.

## Do not use LabelLens for

- Blank annotation from unlabeled source data.
- Team assignment, adjudication, or workforce management.
- Image, audio, video, or multimodal annotation.
- First-class span editing today.
- Per-field extraction analytics or per-field queues — only basic totals are surfaced.

Those may integrate later through import/export bridges, but the current product is optimized for fast local review of pre-labeled text records.
