## LabelLens

Terminal-first review tool for noisy text training data. The domain is **review of pre-labeled records**, not blank-data annotation.

## Language

**Record**:
A row of source data: candidate text plus optional surrounding context. Identity is content-hashed by default (text + context_before + context_after) so the same line in different documents is distinct.
_Avoid_: Row, item, example, sample.

**Prediction**:
A machine-produced label proposal carried on an input record. Has a `source` (origin), optional `confidence`, optional `reason`. A record may carry several.
_Avoid_: Suggestion, guess, output. ("Suggestion" is reserved for assistant proposals.)

**Annotation**:
The human-reviewed final label committed for a record. Stored separately from predictions; never derived from them silently.
_Avoid_: Label (ambiguous — could mean prediction or annotation), final label.

**Primary prediction**:
The single prediction surfaced as the headline on the review screen. Selected by highest `confidence`; missing confidence loses to any numeric value; ties fall back to array order. Alternatives render in a one-line strip below the focus box.

**Review state**:
A record's lifecycle position. Mutually exclusive: `pending`, `accepted`, `relabeled`, `rejected`, `skipped`. **`skipped` is its own state** — counted separately from `pending` in stats; lives in a dedicated `skipped` queue, not in `pending`.

**Undone**:
A compensating review entry that logically removes a prior effective review. Insert-only (PRD §11.4): undo never deletes. Stored as a `reviews` row with `status='undone'`, `final_label=null`, `prev_label=<prior final_label>`, `compensates_review_id=<original id>`. The compensated row and the undo row are excluded from `currentReview` / progress counts; the record returns to `pending`. The undo row itself is shown in the history strip (rendered with `<`) so the action is visible to the reviewer.
_Avoid_: Delete, revert (these imply destructive mutation).

**Note**:
Free-form per-record annotation stored on `records.note`. Auxiliary metadata orthogonal to review state — editable on a `pending` record without inventing a placeholder review row, and unaffected by undo. One note per record (overwriting replaces it). Not part of the audit trail; reviews carry no `note` column.
_Avoid_: Comment (overloaded), reason (reason is a queueing signal).

**Tag**:
A free-form marker orthogonal to review state. A record can be `accepted` and tagged simultaneously. Built-in tag: `marked` (Needs Review).
_Avoid_: Flag, status (status means review state).

**Source**:
The origin of a prediction — `llm:gpt-4`, `rule.entry_boundary`, `model_v1`, etc. First-class for filtering and stats.

**Reason**:
Why a prediction is in review queue — `low_confidence`, `source_disagreement`, etc. Different from **Issue**.

**Issue**:
A prioritization signal attached to a record per type, with score. Multiple coexist (`source_disagreement` 0.71 + `low_confidence` 0.42 on the same record). MVP types: `low_confidence`, `source_disagreement`, `exact_duplicate`. Imported types (e.g. from Cleanlab) are stored verbatim.
_Avoid_: Error, problem (overclaims; LabelLens never asserts label-correctness verdicts).

**Source of truth**:
Audit tag on each review entry: `human` or `human+assistant`. Tagged `human+assistant` whenever the assistant Overlay was viewed for that record before the action — not only when the suggestion was accepted.

**Orphan**:
A record whose content-hash id no longer matches anything in the current ingest (because source text or context changed and the id shifted). Stored as `records.orphan = 1`. Predictions, reviews, and tags stay attached — orphans are preserved, not destroyed. Excluded from every built-in queue except `orphans`. Set during smart re-ingest (ADR 0002, PRD §13). Users needing stable identity across text edits provide an explicit `id` field in the JSONL (ADR 0001).

**Queue**:
A SQL-backed filter over records. Built-in: `pending`, `low-confidence`, `disagreements`, `flagged`, `marked`, `skipped`, `orphans`, `by-source:<s>`, `by-reason:<r>`, `by-label:<l>`, `by-issue:<t>`, `by-correction:<from>:<to>`. Power users compose with `:where`. Every built-in queue except `orphans` excludes orphan records.

**Cursor**:
The reviewer's position within a **Queue** — index into the ordered list of pending records the queue resolves to. One Cursor per Queue, persisted at app scope so screen switches and queue switches preserve focus. Refreshed lazily on next access — fresh cursors re-query from scratch; focused-cursor refreshes after a decision/undo go through `cursor.refresh()` at the call site.
_Avoid_: Position, pointer, head (overloaded with linked-list pointers).

**Document**:
A logical group of related records sharing a `document_id`. Resolved per **Boundary task** from the configured `boundary.documentField` (top-level), then `meta.document_id`, then `meta.doc`. Used to group records into the **Doc view** escape hatch and to derive same-doc context.
_Avoid_: File, source, group (overloaded).

> Slice 4 only indexes the default path (`document_id` top-level, `meta.document_id`, `meta.doc`) on the `records_with_primary` view. If `boundary.documentField` names a field outside that set, **Doc view** will appear empty even though `resolveDocumentId` returns a value. Tracking generalizing the view for arbitrary fields as a follow-up.

**Context strip**:
Banded `±N` rows of preceding and following text rendered around the focus box on the review screen for the **Boundary task**. `N = boundary.contextLines` (default 3). Lines come from the focused record's `context_before` / `context_after` strings, split on newline (last N before, first N after). Context rows render dimmer than queue siblings and have no focus box.
_Avoid_: Window, surroundings.

**Doc view**:
Read-only full-document view entered via `g d` chord on the review screen. Shows every **Record** sharing the focused record's **Document**, with the candidate line highlighted and the focus box drawn. Banding is off in doc view to keep it scannable. Owns its own keymap scope (`doc-view`) — only scroll keys (`j` / `k`, `ctrl-d` / `ctrl-u`, `g g`, `G`) and exit (`q` / `esc`). Doc view does **not** mutate the **Cursor**; exit returns to the same record in the same queue.
_Avoid_: Source view, raw view, file view.

**Batch**:
A group of **Review entries** committed in one logical bulk action and grouped by a shared `batch_id` (UUID). Each member is a normal Review entry; the shared id is the only thing that ties them together. Bulk actions target the **Marked** Tag as the selection set; already-reviewed marked Records are excluded from review actions but cleared by `:bulk-unmark`. Undoing the latest Review surfaces the batch path when its `batch_id` is set — one logical undo reverses every effective member by inserting per-member compensating Reviews.
_Avoid_: Group, bunch, set (overloaded).

**Overlay**:
A modal sub-surface that captures keypresses while open and commits an action when it closes. Relabel **Picker** (`r`), **Note** prompt (`n`), **Assistant** (`i`, slice 11), Queue, Help, Guidelines, and Stats all use this seam. Each Overlay owns its state, accepts a uniform `OverlayEvent` (key, stream token, cancel, commit), and emits data **Effects** (`close`, `commitDecision`, `updateNote`, `markAssistantViewed`) the screen interprets against the AppContext. Text-input Overlays capture all keys; read-only and picker-style Overlays may explicitly propagate unclaimed keys back to the active command path.
_Avoid_: Modal, dialog, popup. (Pre-ADR-0009 docs called the assistant surface a "panel"; the current shape is an inline-footer Overlay — ADR 0009.)

## Relationships

- A **Record** carries zero or more **Predictions** and zero or more **Issues**.
- An **Annotation** is produced by reviewing a **Record**; stored as a **Review entry** referencing the record.
- Each **Review entry** has exactly one **Review state** and a **Source of truth** tag.
- A **Record** may carry zero or more **Tags**, independently of its **Review state**.
- A **Queue** is a filter over **Records** (sometimes joined to **Review entries** for correction queries).
- An open **Overlay** receives raw key events first. Claimed keys stay local; explicitly propagated keys continue through the active command path. Opening the **Assistant** Overlay marks the current Record's **Source of truth** as `human+assistant` (ADR 0004).
- **Stats surface** rows are navigable filters: every aggregation compiles to a **Queue**.

## Example dialogue

> **Dev:** "If the LLM relabels a record, do we keep the old prediction?"
> **Domain expert:** "Yes — a re-ingest where only `predictions[]` changed refreshes predictions and keeps reviews. We never throw away an **Annotation** because an upstream **Prediction** changed."
>
> **Dev:** "What if the reviewer presses `i`, reads the suggestion, then disagrees and presses `x`?"
> **Domain expert:** "**Source of truth** is `human+assistant` for that **Review entry** — they were exposed to the assistant. `human` is reserved for actions taken without ever opening the assistant Overlay."
>
> **Dev:** "Skipped records — pending or reviewed?"
> **Domain expert:** "Neither. Skipped is its own **Review state**. It has its own queue. Don't lump it into pending."

## Flagged ambiguities

- **`labels[].glyph`** in `labellens.config.json` is parsed but not yet rendered. Reserved for the boundary-task label rendering work that overlays per-label glyphs on the kind defaults in `src/render/glyph-map.ts`. Set values are accepted but have no visual effect today.
- "Label" is overloaded (prediction vs annotation). Use **Prediction** or **Annotation** explicitly. Reserve plain "label" for the *value* (e.g., `food`, `SECTION_HEADER`), not the relationship.
- "Suggestion" reserved for **assistant** output. Never use for **Prediction**.
- "Status" means **Review state**, not arbitrary state. **Tag** is separate.
- "Reason" (why a record is queued) ≠ "Issue" (typed signal with score). Different concepts; both can apply to the same record.
