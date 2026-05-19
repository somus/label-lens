# LabelLens roadmap

Features deferred past v0.1. Listed by pre-v1 release bucket (`v0.2`, `v0.3`, etc.), not by date. The goal is to ship coherent minor-version bundles before v1.0. Items move out of this file when they ship.

For shipped behaviour, see [PRD.md](./PRD.md). For load-bearing design decisions, see [docs/adr/](./docs/adr/).

## Pre-v1 0.x releases

Larger features deferred until the MVP loop is polished. Each bucket below matches the GitHub milestone with the same name.

### v0.2 Reviewer ergonomics and smart prioritization

- **Keybinding presets (#117).** Add built-in `simple` and `vim` keybinding presets, make `simple` the default for missing `keys.preset`, and let projects define config-local custom presets. The current vim-inspired keymap remains available as `vim`.
- **Active learning and smart prioritization (#93).** As reviewers commit decisions, re-weight built-in prioritization signals (`low_confidence`, `source_disagreement`, `exact_duplicate`) based on current-session relabel lift. Imported issue scores stay fixed, learned weights stay session-local, and reranking must not jump current focus.
- **Confidence threshold tuning (#103).** Let reviewers configure `signals.lowConfidence.default` plus per-source overrides. Threshold changes recompute computed `low_confidence` Issues and feed both the `low-confidence` Queue and smart-pending score.

**Later.** Model-in-the-loop active learning remains v1.0+; it needs model selection, training cadence, calibration, and cold-start handling.

### v0.3 Batch and similarity review

- **Bulk operations (#94).** Reviewer tags Records with `marked`, then runs `:bulk accept`, `:bulk relabel <label>`, `:bulk reject`, `:bulk skip`, or `:bulk unmark`. Batch Review entries share `reviews.batch_id`, write normal audit rows, and undo as one logical action.
- **Embedding similarity view and cluster review (#95).** Store one active embedding per Record and expose `:similar` / `:similar-to <record-id>` Queues ranked by cosine similarity. Cluster review uses marked Records plus #94 bulk actions; no automatic Annotation propagation.
- **Near-duplicate detection and conflicting cluster flagging (#107).** Add pure TypeScript 64-bit SimHash over normalized `record.text`, emit `near_duplicate` and `near_duplicate_conflict` computed Issues, and keep exact duplicates on the existing `exact_duplicate` path.
- **Conflict queues (#108).** Add an aggregate `conflicts` Queue backed by explicit conflict-style Issue types such as `source_disagreement`, `near_duplicate_conflict`, `*_conflict`, and `conflict:*`. Producer issues compute conflicts; this issue only routes and surfaces them.

### v0.4 Prediction evidence and boundary UX

- **Inline highlights for prediction evidence (#98).** Accept upstream `predictions[i].highlights: [{ start, end, weight }]`, validate offsets into `record.text`, render capability-tiered evidence spans, and preserve highlights in exported Prediction objects.
- **Multi-line entry primitive for boundary task (#99).** Support boundary Records whose `text` contains embedded newlines. A multi-line entry is still one Record, one candidate, one Review decision, and one cursor step; exports preserve the original text string.
- **Block coloring for boundary task (#100).** Visually group predicted `ENTRY_START` / `CONTINUATION`-style runs in review and doc view using consistent Prediction-based block computation. This is visual only and does not alter Review or export semantics.
- **Boundary sequence diagnostics (#104).** Analyze boundary documents after ingest/re-ingest, emit structural Issues such as continuation-before-start or repeated-header, and add boundary stats for document structure quality.

### v0.5 Calibration and rationale analytics

- **Confidence calibration stats view (#96).** Add aggregate and per-Source confidence decile bins to Stats, using `accepted-as-predicted`, relabeled, and rejected outcomes from effective Reviews.
- **Rationale capture on relabel and reject (#97).** Store optional or required `reviews.rationale` for relabel/reject decisions, distinct from Prediction Reason and Record Note. Review-log export includes rationale; current-state JSONL/CSV do not.
- **Per-correction rationale aggregation (#102).** Aggregate exact trimmed rationales across effective relabel correction pairs and show top rationale counts beside existing Top corrections rows and Markdown stats export.

### v0.6 Re-ingestion and CSV data lifecycle

- **Versioned diff after predictions-only re-ingest (#101).** Preserve Review state, store bounded Prediction history, and show added/removed/changed primary Prediction label diffs after predictions-only re-ingest.
- **Smart re-ingestion merge follow-up (#106).** Preserve reviewer-owned state across source text/context edits only when the input provides stable explicit IDs; content-hash edits keep ADR 0001 orphan/new semantics.
- **CSV import with inference rules (#111).** Add `input.format: "csv"` with a pure TypeScript streaming RFC4180 parser, header-based inference, one Prediction per row, metadata preservation, and clear malformed-row errors.

### v0.7 Additional review task types

- **Multi-label classification task (#105).** Add `task: "multi-label"` through TaskRenderer, storing canonical JSON array text in existing Prediction and Review label fields while keeping one Review row per Record.
- **Multi-label export shape (#110).** Export reviewed multi-label Annotations as JSON arrays in JSONL and joined CSV cells using `output.csvMultiLabelSeparator`, failing on malformed stored labels or ambiguous separator values.
- **Extraction review task without spans (#112).** Add `task: "extraction"` as form-style structured field correction for configured string/null fields. This is object review, not NER/span editing or blank-data annotation.
- **Pairwise / preference review task (#113).** Add `task: "preference"` for winner selection among pre-generated candidates, with stable candidate IDs, number-key accelerators, assistant recommendations, and object-shaped exports.

### v0.8 Dataset and export adapters

- **Stratified train/dev/test split export (#109).** Extend existing JSONL/CSV exports with deterministic split flags/config, stable hash assignment, optional stratification by emitted final Annotation label, and sibling split files.
- **Hugging Face and spaCy-friendly exports (#114).** Add `hf-jsonl` and `spacy-jsonl` adapter exports for supported classification-style tasks, excluding rejected/skipped rows and failing clearly for unsupported task types.

### v0.9 Assistant polish and distribution

- **Streaming assistant UI niceties and subscription OAuth (#115).** Keep ADR 0009's inline assistant footer, polish streaming/loading/error/cancel states, and add subscription OAuth only when pi-ai exposes stable headless support.
- **Brew formula and tap (#116).** Add a dedicated Homebrew tap and `labellens` formula that installs existing release tarballs while preserving the bundled `parser.worker.js` runtime layout.

## v1.0+ / future

- NER / span review (technical risk; see [PRD §19](./PRD.md#19-why-ner-and-extraction-with-spans-are-deferred)): first-class `span` / `ner` task type; `{ start, end, label, text }` predictions; span accept/reject/relabel; boundary adjustment; missing-entity insertion; overlap resolution; exhaustive document/section marking; full document/section span view with inline colored spans and candidate list; NER exports for BIO/IOB2, Hugging Face token-classification JSON, spaCy-style entities, and generic `{ text, entities }` JSONL.
- Label Studio / Doccano import-export bridges
- Resume-ner bridge: import `training_v2` review queues/actions into LabelLens and export back to `reviewed_actions.jsonl` only after span editing, missing-entity insertion, exhaustive marking, and compatible export semantics exist.
- Inter-session quality comparison (this review pass vs last)
- Multi-dataset workspace
- Optional remote sync for personal use across machines
- **LabelLens MCP server.** Expose review state via an MCP daemon — list pending records, fetch one by ID, submit annotations, query stats — so coding agents can drive review headlessly while a human supervises in another terminal. Pairs with the data model in [PRD §11](./PRD.md#11-data-model).
- **Agent skill (`labellens-review/SKILL.md`).** A skill file that an LLM agent loads to understand how to interact with a live LabelLens session via the MCP server. Lets a coding agent help triage a queue under human direction.
