# LabelLens roadmap

Features deferred past v0.1. Listed by priority bucket (V1, V2), not by date. Items move out of this file when they ship.

For shipped behaviour, see [PRD.md](./PRD.md). For load-bearing design decisions, see [docs/adr/](./docs/adr/).

## V1

Larger features deferred until the MVP loop is polished. Each item below was grilled in a v2.9 design pass — scope, design choices, and open questions are captured.

### V1.1 Active learning / prioritization (phased: heuristic first, model later)

**Scope.** As reviewers commit decisions, re-weight the built-in prioritization signals (`low_confidence`, `source_disagreement`, `exact_duplicate`) based on how strongly each signal correlates with relabels in the current session. Updates feed the `smart-pending` cursor's composite score so the next-record order reflects what's been learned.

**Design.**
- Recompute weights every `navigation.rerankInterval` decisions (default 25; configurable).
- Built-in signals only. Imported issue scores (Cleanlab, etc.) are honored at face value — never overridden.
- Cold start: equal weights until the first `navigation.rerankColdStart` decisions land (default 50).
- No UI surfacing of "why this record bumped up" — trust the order. Reviewer can fall back to deterministic queues (`low-confidence`, `disagreements`) if they want predictable sort.

**Phase 2 (V1.5 / V2).** Model-in-the-loop: train a small classifier on accepted labels mid-session, re-rank by uncertainty. Out of V1 scope — needs model selection, training cadence, calibration, cold-start handling.

**Open questions.** Sample-size floor before per-signal weight update is statistically meaningful; how to handle a session that flips heavy signal mid-way (reviewer changes mind).

### V1.2 Bulk operations (mark-and-batch)

**Scope.** Reviewer tags records with `m` (existing `marked` tag), then commits a bulk action across every marked record. Single batch action = single audit entry per record + a single logical undo.

**Design.**
- Commands: `:bulk accept`, `:bulk relabel <label>`, `:bulk reject`, `:bulk skip`, `:bulk unmark`.
- Confirmation modal: `Apply <action> to N records? [y/n]` before commit lands.
- Undo: one `u` press reverses the entire batch (inserts N compensating review rows under one logical action group).
- Auto-clear marks: reviewed records lose the `marked` tag on commit; un-reviewed marked records keep theirs.
- Visual range select + filter-to-queue bulk are explicitly **out of V1** — mark-and-batch is the only mechanism.

**Open questions.** Batch-undo grouping in SQL (separate `review_batches` table, or `reviews.batch_id` column).

### V1.3 Embedding / similarity view

**Scope.** Compute embeddings at ingest, store on the record, expose a `:similar` / `:similar-to <id>` queue that surfaces semantically similar records.

**Design.**
- Provider configurable: `embedding.provider: pi-ai | ollama | supplied`. `supplied` reads pre-computed embeddings from the JSONL.
- Compute at ingest time (precompute all, store as SQLite BLOB on the record).
- Embedding input field(s) configurable via `embedding.fields: ["text", "meta.merchant", ...]` (default `["text"]`).
- New queue `:similar` (operates on the focused record) and `:similar-to <record-id>` (explicit id). Top-K = 10 by default (`embedding.topK`). Minimum cosine = 0.7 (`embedding.minCosine`); records below the cut-off don't surface even if in top-K.

**Open questions.** Recompute trigger when records change post-ingest (re-ingest text-change path). Vector-index file vs SQLite BLOB scan at very large N (>100K) — V1 ships the BLOB-scan path; promotion to a separate index file (HNSW or similar) is a V2 perf optimization.

### V1.4 Confidence calibration view

**Scope.** Bin predictions by confidence decile (0–10%, 10–20%, …), measure what the reviewer did (% accepted as-predicted vs relabeled vs rejected). Surfaces over- or under-confident models.

**Design.**
- Extends the existing stats screen — new section under totals + corrections.
- Both aggregate (all predictions) and per-source breakdown rendered. Aggregate is the top block; expandable rows per source below.
- Sample-size floor: bin renders only when ≥10 records have been reviewed in that confidence range. Smaller bins suppressed to avoid noise.
- Bins drill into queues: clicking a bin opens `where:confidence >= 0.4 and confidence < 0.5` (or the per-source variant). Reviewer navigates as usual.

**Open questions.** Decile vs custom bin boundaries (boundary-task labels may cluster around different confidence regions). Whether to render a calibration curve glyph (text-based bar) or just per-bin counts.

### V1.5 Reason / rationale capture on relabel

**Scope.** When the reviewer relabels or rejects a record, optionally capture a short "why." Aggregated under per-correction views (V1.10) to surface patterns.

**Naming.** Stored as `reviews.rationale`. New word, picked to avoid overload with `prediction.reason` (queueing signal per CONTEXT.md). Distinct from `records.note` (free-form per-record annotation, orthogonal to review state).

**Design.**
- `reviews.requireRationale: true` in config makes the rationale required for relabel + reject (default off — optional, reviewer can blow past).
- Prompt is inline (no modal): after the decision lands, a one-line input slides in. Esc commits without rationale.
- Input format: pick from a configured list with free-form fallback. Config: `reviews.rationales: ["wrong label", "ambiguous", "model overconfident", ...]`. Number keys 1–9 commit a list item; typing falls into free-form mode; backspace clears.
- Scope: relabel + reject only. Accept and skip don't carry a rationale (V1).

**Open questions.** Whether `reviews.rationale` is its own column or a JSON-blob field on `reviews`. Column wins for query speed; JSON wins for future extensibility.

### V1.6 Inline highlight of words driving prediction

**Scope.** Render visual spans inside `record.text` showing which characters drove the prediction. BYO from upstream — LabelLens does not compute LIME/SHAP/attention.

**Design.**
- JSONL field: `predictions[i].highlights: [{start: int, end: int, weight: number}]`. Offsets into `record.text`. Weight ∈ [0,1].
- Multi-source records: `[` / `]` (existing alternatives-cycling chord) also swaps which source's highlights render. Reviewer can see each source's salient spans.
- Render style is capability-tiered. Truecolor / 256: tinted background scaled by `weight`. 16-color / mono: underline + bold for high-weight spans.
- Per-record offsets only. Highlights never index into `context_before` / `context_after` — those are context, not the labeled record. When multi-line entries land (V1.7), `record.text` is just longer; the same offset model spans newlines naturally.

**Open questions.** Whether to also tint corresponding label rows in the chip rail (link prediction → triggering span).

### V1.7 Multi-line entry as primitive (boundary task)

**Scope.** Boundary task accepts records whose `text` field spans multiple lines (e.g. one resume entry = one JSONL row with newline-separated lines). Reviewer labels the whole entry. No in-tool line-merging — entry boundaries are upstream's call.

**Design.**
- JSONL row's `text` carries `\n` characters. We render it across multiple visual rows inside the focus box.
- Backwards compatible: existing line-by-line boundary JSONL still works. Same `task: boundary` config. Tasks-renderer treats single-line and multi-line records uniformly.
- Labels fully user-configurable via existing `config.labels`. Reusing the line-level set (`SECTION_HEADER`, `ENTRY_START`, `CONTINUATION`, `NOISE`) is fine; users with entry-level data will likely configure a smaller set.
- Focus box rendering: render the full entry; subject region auto-resizes downward. Cluster-at-top spacer below absorbs less. Doesn't soft-cap or scroll within the box — fidelity over neighbour visibility.

**Open questions.** How `boundary.contextLines` interacts with multi-line entries — does ±N mean N entries or N raw lines? V1 should treat it as N entries (neighbours = other records).

### V1.8 Block / entry coloring (boundary task)

**Scope.** Color contiguous runs of `CONTINUATION` (and similar) under their `ENTRY_START` as a visual block, so reviewers see entries as units even when records remain line-by-line.

**Design.**
- Trigger: predicted boundaries (read from `predictions[].label`). Reviewer sees what the model grouped before committing.
- Treatment: shared background tint per block. All lines in one block share the same band color; differs from neighbouring blocks (no even/odd alternation inside a block).
- Scope: both review screen band region and doc-view (`g d`). Consistent across both surfaces.
- Becomes less critical once V1.7 (multi-line entries) lands — entries are already blocks by definition. V1.8 still matters for legacy line-by-line boundary data and for use cases where upstream emits line-level predictions.

**Open questions.** Whether to color blocks beyond `ENTRY_START` → `CONTINUATION` (e.g. group records by `meta.section_id` when present).

### V1.9 Versioned diff after re-ingest

**Scope.** After a predictions-only re-ingest ([ADR 0002](./docs/adr/0002-smart-reingest.md)), show the reviewer which predictions changed since the prior version.

**Design.**
- Diff covers prediction changes only. Text changes go through the existing re-ingest text-change flow; reviews never change on re-ingest ([ADR 0007](./docs/adr/0007-effective-review-entry.md)).
- Persist the last N prior versions in a `prediction_history` SQLite table (default N=3, `signals.predictionHistoryDepth`). Bounded growth.
- Auto-show a dedicated diff screen on re-ingest completion: `X predictions changed, Y added, Z removed`. Reviewer skims, dismisses, then enters review.
- "Changed" = primary label flipped. Confidence delta alone doesn't count for V1 (avoids noise from re-runs that nudge confidences).

**Open questions.** Diff screen layout — table per-record, or summary by source / by correction pair. Interaction with V1.10 per-correction rationale (changed-prediction queue is a natural rationale-aggregation surface).

### V1.10 Per-correction rationale aggregation (depends on V1.5)

**Scope.** Aggregate the rationales captured under V1.5 per `(from, to)` correction pair so the stats screen surfaces the dominant "why" patterns, not just the count.

**Design.**
- Lives in the stats screen. Each existing correction row (`food → utility, 14 records`) expands to show the top 3 rationales with counts: `12× wrong label · 2× ambiguous`.
- No per-source breakdown in V1 — keeps the view compact. Reviewer drills into the `by-correction:<from>:<to>` queue for source detail.

**Open questions.** Aggregation across sessions vs current-session-only. SQL view that pivots `reviews.rationale` by `(prev_label, final_label)`.

### V1.11 Confidence threshold tuning

**Scope.** Let the reviewer set the `low_confidence` cut-off, with optional per-source overrides, and have it flow into both the `low-confidence` queue and the `low_confidence` signal score that feeds `smart-pending`.

**Design.**
- Config-driven for V1: `signals.lowConfidence.default = 0.5`, `signals.lowConfidence.bySource: { "llm:gpt-4": 0.6, "regex.*": 0.3 }`. UI for in-app tuning is a follow-up.
- Tuning affects: `low-confidence` queue membership (cut-off determines inclusion) and the `low_confidence` issue's severity score (rescored when threshold changes). Calibration view (V1.4) re-bins implicitly via its own decile model — not directly coupled.
- Persisted to `labellens.config.json` on commit. Re-launch picks up the new value.

**Open questions.** Whether the threshold change should retroactively recompute issue severities or only apply on next ingest. V1 defaults to "recompute on threshold change" so the queue reflects the latest cut-off without re-ingest.

### V1 — other features (carried over from prior PRD versions)

- Multi-label classification (with toggle UI and `Space` / `Enter` semantics). Slots into the `TaskRenderer` abstraction.
- Smart re-ingestion merge (preserve reviews across edits, soft-delete removed records, surface new ones).
- Near-duplicate detection via MinHash; conflicting-duplicate flagging.
- Train / dev / test split with stratified option.
- Multi-label export shape.
- CSV import (with inference rules extended).
- Extraction review (form-style, no spans).
- Pairwise / preference review.
- Hugging Face / spaCy-friendly export shapes.
- Streaming assistant UI niceties; subscription OAuth headless code-paste flow once `pi-ai` upstream stabilizes.
- **Brew formula and tap.** Third distribution channel after curl + npm prove out in MVP.

## V2 / future

- NER / span review (technical risk; see [PRD §19](./PRD.md#19-why-ner-and-extraction-with-spans-are-deferred))
- Label Studio / Doccano import-export bridges
- Inter-session quality comparison (this review pass vs last)
- Multi-dataset workspace
- Optional remote sync for personal use across machines
- **LabelLens MCP server.** Expose review state via an MCP daemon — list pending records, fetch one by ID, submit annotations, query stats — so coding agents can drive review headlessly while a human supervises in another terminal. Pairs with the data model in [PRD §11](./PRD.md#11-data-model).
- **Agent skill (`labellens-review/SKILL.md`).** A skill file that an LLM agent loads to understand how to interact with a live LabelLens session via the MCP server. Lets a coding agent help triage a queue under human direction.
