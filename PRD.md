# PRD: LabelLens — Terminal Reviewer for Noisy Text Training Data

> **Version 2.8.** Update over v2.7: storage layer adopts `drizzle-orm/bun-sqlite` with bundled migrations (per ADR 0005), and `records_with_primary` is now a SQL view defined in a custom migration. No behavior change to the review loop or any user-visible feature. Earlier change log preserved.
>
> **Version 2.7.** Supersedes v2.6. Updates over v2.6 (all from grilling session resolved against `docs/adr/0001`–`0004`): `skipped` promoted to a distinct review state with its own queue (§10.3, §11.4); smart re-ingest distinguishes text-change vs predictions-only refresh (§13); SSH-default assistant config flow tightened — disabled at init, prompt on first `i` (§10.5); `source_of_truth` tags `human+assistant` whenever the panel was viewed, not only when the suggestion was accepted (§10.5, §11.2); stats screen drilldown closed via `:by-correction` and `:where` queue forms (§10.3, §10.8); multi-prediction display: alternatives strip below focus box (§14.1); boundary navigation stays queue-ordered with expanded context plus `g d` doc-jump (§14.1); `labellens migrate --rename` introduced for label renames (§11.4); MVP distribution staged to curl-installer + npm at v0.1, brew formula deferred to V1 (§16, §16.1, §18). Earlier v2.6 changes preserved below.

## 1. Product summary

**LabelLens** is a terminal-first, local-first review tool for cleaning noisy text training datasets produced by rules, LLMs, weak supervision, or early model predictions.

It is not a general annotation platform. It is a fast, keyboard-driven reviewer for developers who already have pre-labeled text data and need to verify, reject, relabel, or investigate uncertain examples before training small classifiers, document boundary classifiers, or extraction systems.

LabelLens ships as a **self-contained Bun-compiled binary with bundled runtime assets** — no Node.js or Python required, one-step install via curl, brew, or npm — runs over SSH on a VPS or on a personal laptop with zero install ceremony, and stores all review state locally next to the source dataset.

## 2. Why a TUI

The TUI choice is the product's distribution and trust story, not an aesthetic.

- **Runs anywhere with a one-step install.** Bun's `--compile` produces a Bun-compiled binary; the install script (or `brew install`, `npm i -g`) places the binary together with its runtime assets in a single directory; no Node.js or Python on the host required.
- **Works over SSH.** No browser, no port-forwarding, no auth layer. SSH into the box that has the data and review where it lives.
- **No server, no accounts, no collaboration layer.** Local-first by design. The dataset, review state, and exports stay on the machine; data leaves only when the user explicitly enables the LLM assistant with an API key or subscription (see §10.5 for what gets sent).
- **Modern TUI libraries are app-class.** OpenTUI gives React-like composition, layout, and rich rendering — sufficient for a focused review experience.
- **Faster than a browser tool for keyboard-first workflows.** No page reloads, no DOM thrash; key-to-action is one event.

Web-based annotation tools (Label Studio, Argilla, Doccano, Prodigy) all assume a server-and-browser deployment. That is the wrong shape for "I have a 5K-row JSONL file on my laptop and want to clean it in 30 minutes."

## 3. Problem

Developers building personal or small ML systems often start with messy text data and noisy labels:

- LLM-labeled rows
- regex/rule-generated labels
- weak-supervision outputs
- early model predictions
- low-confidence classifications
- document boundary candidates

Existing options fail in different ways:

| Current workflow       | Problem                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| Spreadsheet / CSV      | No context view, no prediction metadata, weak keyboard flow     |
| One-off notebook       | Rebuilt for every dataset, poor review UX                        |
| Label Studio / Doccano | Useful, but web/server setup is heavy for quick local review     |
| Prodigy                | Strong developer workflow, but paid and browser-centered         |
| Argilla                | Strong data-curation model, but platform-oriented                |
| Custom CLI             | Works once, then gets rebuilt next dataset                       |
| LLM-coded one-off CLI  | Cheap to vibe-code; lacks queues, stats, prediction metadata, reusability across datasets |

The pain is not "I need to label blank data." It is:

> "I have noisy labels already. I need to quickly decide which examples are correct enough to keep, and I need the highest-value examples surfaced first."

## 4. Target users

### Primary user

**Solo developer / ML builder.** Builds small classifiers, document parsers, or extraction systems. Works with JSONL/CSV. Uses LLMs, rules, or weak models to generate labels. Needs a fast review loop before training.

### Secondary users

| User type           | Use case                                                       |
| ------------------- | -------------------------------------------------------------- |
| NLP hobbyist        | Clean text-classification datasets                             |
| Indie hacker        | Classify emails, transactions, support messages, user feedback |
| Document AI builder | Review resume/PDF/invoice line boundaries                      |
| ML engineer         | Inspect noisy labels before fine-tuning                        |
| Evaluation builder  | Review LLM outputs and pass/fail judgments                     |

## 5. Positioning

> **Review noisy text labels from your terminal.**
> A local TUI for reviewing LLM-, rule-, and model-labeled text datasets. Accept, reject, relabel, ask an assistant, and export clean training data.

### What it is not

- Not a full annotation platform.
- Not a Label Studio replacement for blank-data labeling.
- Not a team labeling workforce tool.
- Not a model training platform.
- Not a multimodal annotation system.

## 6. Core insight

Most annotation tools optimize for:

```
unlabeled data → human annotation → dataset
```

LabelLens optimizes for:

```
rules / LLM / model predictions → human review → clean training data
```

Humans increasingly review machine-generated labels rather than label every record from scratch. LabelLens makes that loop the primary workflow rather than an afterthought feature.

## 7. Goals

### Product goals

1. Open a noisy dataset and start reviewing within 2 minutes (zero-config path).
2. Make prediction metadata first-class: label, confidence, source, reason, disagreement, issue type.
3. Surface the highest-value records to review first, automatically.
4. Support classification, multi-label classification, and document boundary classification well.
5. Provide clean exports for downstream training.
6. Reduce context switching by integrating label guidelines and optional LLM assistance.
7. Help users understand dataset quality through review stats and issue summaries.

### Non-goals (any version)

- Multi-user collaboration, accounts, or permissions.
- Hosted/SaaS deployment.
- Image, video, audio, or multimodal annotation.
- Model training orchestration.
- Plugin marketplace.
- Browser UI.

## 8. Use cases

### Use case 1: Text classification review (P0)

10K rows labeled by an LLM or rule system. Reviewer wants to verify low-confidence rows and export clean training data.

```
food, travel, shopping, utility, salary, rent, other
```

### Use case 2: Document boundary review (P0)

Reviewer is building a resume or document parser and needs to decide whether each line is a section header, entry start, continuation, or noise. Each line is unlabelable in isolation — context above and below is essential.

```
SECTION_HEADER, ENTRY_START, CONTINUATION, NOISE
```

This is LabelLens's strongest wedge. Generic annotation tools do not optimize for line-level structural decisions where surrounding lines are the signal. Terminals render this naturally: candidate line highlighted, context above and below in the same vertical view.

### Use case 3: Multi-label classification (P1)

A record can carry multiple labels (e.g., topic tagging on support messages). Reviewer toggles labels per record.

### Use case 4: LLM extraction review (P1)

Reviewer has LLM-generated structured fields (name, email, dates, amounts) and wants to correct values. Form-style review, no span editing.

### Use case 5: Ambiguous label investigation (P0)

Reviewer is unsure whether a label is correct. Pressing `i` opens an in-pane LLM assistant with task-aware reasoning, evidence, and a recommendation.

NER / span review is **not** a v1 use case. See Section 19.

## 9. Core user journey

```
1. User runs `labellens init` in a directory containing pre-labeled JSONL.
2. Tool auto-detects schema (text field, prediction field, confidence field) and
   shows an inferred config for confirmation.
3. User confirms or edits config.
4. Tool ingests data into a sidecar SQLite database and computes initial issue scores.
5. Tool opens the review screen with the most-uncertain record first.
6. User accepts, rejects, relabels, skips, or asks the assistant — keyboard only.
7. User can switch queues (low-confidence, disagreements, label-issues, by source, by reason).
8. User views stats screen for review progress and dataset quality.
9. User exports clean training data to JSONL or CSV.
```

## 10. Product requirements

### 10.1 Dataset review

Fast keyboard-first review interface. Required actions:

- Accept prediction
- Reject prediction
- Relabel record (single-key 1–9 for the first 9 labels; fuzzy picker for any label)
- Skip record
- **Mark** record with an additive "Needs Review" tag (orthogonal to status — a record can be both `accepted` and `marked`)
- Add note
- Undo last action
- Show progress
- Show task instructions
- Show candidate text
- Show context before and after
- Show prediction (label, confidence, source, reason) **rendered inline on the label list**, not as a separate strip — see §14.5
- Show per-record issue badges (one per issue type with score, e.g., `⚠ source-disagreement (0.71)`)

### 10.2 Prediction vs annotation separation

Predictions (machine output) and annotations (human-reviewed final labels) are distinct first-class concepts. Stored separately in the database. Exports can target either.

| Concept       | Meaning                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| Prediction    | Label suggested by model, LLM, rule, weak supervision, or prior system        |
| Annotation    | Human-reviewed final label                                                    |
| Review state  | `pending`, `accepted`, `relabeled`, `rejected`, `skipped` (mutually exclusive). `skipped` is its **own** state — not a flavor of pending. See ADR 0003. |
| Tags          | Free-form labels orthogonal to state. Built-in: `marked` (Needs Review). Records can carry any number of tags regardless of state. |
| Source        | Origin of prediction: `llm`, `regex`, `model_v1`, `rule.entry_boundary`, etc. |
| Reason        | Why this record is in review: `low_confidence`, `source_disagreement`, etc.   |

### 10.3 Review queues

Users prioritize what to review:

| Queue                       | Meaning                                              |
| --------------------------- | ---------------------------------------------------- |
| `pending`                   | Truly untouched records (review state = `pending`). Excludes `skipped`. |
| `skipped`                   | Records the reviewer skipped — distinct from pending. Revisit here.    |
| `low-confidence`            | Sorted ascending by predicted confidence             |
| `disagreements`             | Records where multiple sources disagree              |
| `flagged`                   | Records flagged by prioritization signals (§10.4)    |
| `marked`                    | Records the reviewer tagged "Needs Review" (additive) |
| `by-source:<s>`             | Filter to a specific prediction source               |
| `by-reason:<r>`             | Filter to one failure mode at a time                 |
| `by-label:<l>`              | Filter to one label                                  |
| `by-issue:<t>`              | Filter to records with a specific issue type         |
| `by-correction:<from>:<to>` | Records where review flipped label `<from>` → `<to>` (joins reviews). Backs the stats drilldown (§10.8). |
| `where:<expr>`              | Power-user predicate over indexed columns. Bare `:where` opens the visual filter builder; `:where <expr>` accepts a raw expression such as `source='llm:gpt-4' and confidence<0.3`. Compiles to SQL `WHERE`. |

Queues are SQL queries over indexed columns. Switching queues is instant. Stats-screen drilldown (§10.8) compiles every aggregation row into one of these queue forms — no ad-hoc per-stat filter spec.

V1 adds: `near-duplicates`, `ambiguous`, and `label-issues` (the last reserved for imported scores from external auditors like Cleanlab).

### 10.4 Review prioritization signals

LabelLens computes a small set of **prioritization signals** at ingest time to surface records most worth reviewing first. These are heuristics, not correctness verdicts: they answer *"this record might deserve a closer look"*, not *"this label is wrong."* The wording matters — the tool must not overclaim.

**MVP signals** (no external compute, run on ingest in a Bun `Worker`):

| Signal              | What it actually says                          | How                                                       |
| ------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| Low confidence      | Model was unsure                               | Direct from `confidence` field if provided                |
| Source disagreement | Multiple label sources conflict on this record | Compare labels across `predictions[]` for the same record |
| Exact duplicate     | Same normalized text appears more than once   | Hash of normalized text                                   |

**Imported signals** (always supported, never recomputed):

If the input JSONL includes an `issues[]` array (e.g., from Cleanlab, a custom audit, or model-probability analysis), LabelLens stores those scores verbatim and surfaces them in queues and per-record displays. This is how `label_issue` and `ambiguous` appear in MVP — only when the user has already computed them upstream. LabelLens does not synthesize these claims.

**V1 signals** (added later, off by default):

- Near-duplicate detection via MinHash/SimHash
- Conflicting near-duplicate groups (similar texts, different labels)
- Embedding-based outliers (via `pi-ai`)
- In-tool ambiguity scoring from a small classifier

**Operational notes:**

- All signal computation runs off the main thread. The user sees a live progress bar ("Hashing records… 4,200 / 10,000") and can cancel cleanly.
- **Issues are stored per-record, per-type, with a score.** A single record can carry multiple simultaneous issues (e.g., a record may be flagged with both `source_disagreement` (0.71) and `low_confidence` (0.42)). The review screen renders each as a small badge in the metadata strip; the queue system supports a `:by-issue <type>` filter to drill into one issue at a time.
- LabelLens **never** silently rewrites labels. Signals prioritize human review; humans decide.
- Per-signal language in the UI must stay honest: "Sources disagree on this record" rather than "Likely label error."

### 10.5 LLM-assisted label explanation

Optional in-pane assistant for ambiguous records. Triggered by `i` ("inquire"). The `?` key is reserved for contextual help (§14.6).

**Implementation:**

- Built on **`pi-ai`** ([earendil-works/pi](https://github.com/earendil-works/pi)) for provider-agnostic access across 20+ providers.
- **BYO-LLM**: user authenticates via `pi-ai`'s OAuth `/login` flow for **Claude Pro/Max, ChatGPT Plus/Pro, or GitHub Copilot subscriptions** — no API key required — or by providing API keys for raw provider access (Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Groq, OpenRouter, Ollama, etc.).
- **Headless / SSH caveat.** Subscription OAuth currently relies on a localhost callback that does not work over SSH or in containers ([pi#2163](https://github.com/earendil-works/pi/issues/2163), Codex equivalents). On a remote VPS the reliable auth paths are **API keys** and **Ollama**. LabelLens registers a code-paste OAuth flow via `pi-ai`'s extension API where possible, but until upstream stabilizes, the documented SSH-friendly path is API key or local model. Subscription OAuth is positioned as a developer-machine convenience, not the SSH default.
- **Local mode supported** via the Ollama provider — private datasets stay on the machine.
- Uses `pi-ai`'s structured output (TypeBox schemas) for typed assistant responses.
- Streams reasoning into the panel.
- Results cached by `(record_id, prompt_hash)` in SQLite to avoid re-querying on revisit.

**Assistant prompt includes:**

- Task description and label definitions (from config).
- Label guidelines.
- Candidate text and surrounding context.
- The current prediction(s) and their sources.

**Assistant response schema:**

```ts
{
  suggestedLabel: string,
  confidence: 'low' | 'medium' | 'high',
  reasoning: string,
  evidenceFor: string[],
  evidenceAgainst: string[],
  recommendedAction: 'accept' | 'relabel' | 'reject' | 'skip',
}
```

**Constraints:**

- Assistant suggestions never auto-apply.
- All assistant queries logged separately from human decisions.
- Assistant must be explicitly enabled in config (off by default).
- Explicit `--local-only` mode disables remote providers.

**SSH-default activation flow.** `labellens init` writes `assistant.enabled = false`. The first time the reviewer presses `i` over an SSH session (or any session, really), the panel opens with a one-shot prompt: pick provider, paste API key OR point at Ollama, OR cancel. No silent network attempts. Choice is persisted to `labellens.config.json` for next session. The privacy notice in "What gets sent" below is shown verbatim before the first remote call commits.

**Audit tagging — viewing counts.** `source_of_truth` (§11.2) is set to `human+assistant` for any review action committed while the assistant panel was open or had been opened for the focused record during that focus session — not only when the suggestion was Enter-accepted. Reading a suggestion is influence; the audit tag reflects exposure. See ADR 0004.

**What gets sent (transparency):**

When the assistant is enabled and a remote provider is configured, each `i` query sends the **current record's candidate text, before/after context, label definitions, and prediction metadata** to the configured provider. It does **not** send the entire dataset, other records, or review history. Calls are cached locally by `(record_id, prompt_hash)`, so re-asking on the same record is free. With `--local-only` or an Ollama provider, no data leaves the machine. This wording should appear verbatim on first-enable in the TUI so the user sees it before opting in.

**Session-context recovery (V1).** When a prediction's `source` field carries a session identifier from the original labeling run (e.g., a `pi-ai` session ID stored in `meta.session_id`), the assistant query can include it so the LLM has access to its own prior reasoning rather than answering from scratch. This is opt-in per source and only applies when the same provider serves both the original labeling and the assistant query. The pattern is borrowed from `critique`, which passes coding-session IDs to its review LLM. MVP does not require this — the prediction metadata alone is enough — but the data model in §11.1 already preserves `meta` for sources that want to expose it later.

### 10.6 Label guidelines

Task-level instructions and per-label definitions are visible during review. Stored in the config file (Markdown or inline strings). Quick-view from the review screen via `g`. Reviewer can mark a record as a "guideline candidate" to revisit and refine guidelines later.

### 10.7 Supported task types

| Task type                   | Priority | Notes                                                     |
| --------------------------- | -------- | --------------------------------------------------------- |
| Single-label classification | P0       | One label per record                                      |
| Boundary / segmentation     | P0       | Line/chunk-level structural classification, context-rich  |
| Multi-label classification  | P1       | Multiple labels per record, toggle UI; deferred from MVP  |
| Extraction review           | P1       | Form-style structured field correction                    |
| Pairwise / preference       | P2       | LLM output comparison, eval workflows                     |
| NER / span review           | V2       | Deferred — see Section 19                                 |

### 10.8 Stats screen

LabelLens is not just a label editor — it is a **dataset debugger**. The stats screen is treated as a first-class surface, not an afterthought.

Required:

- Total / reviewed / pending counts
- Accepted / relabeled / rejected / skipped counts
- Acceptance rate by source
- Relabel rate by source
- Relabel rate by reason
- Most common label corrections (`X → Y`, count)
- Labels with highest correction rate
- Sources with highest correction rate
- Imported issue counts (when present in input)
- Suggested next review queue

**Every aggregation is a navigable filter.** Highlight any row on the stats screen and press `Enter` to jump into a review queue filtered to exactly the records behind that number. The mapping is mechanical: each stat row compiles to one of the queue forms in §10.3.

| Stat row example                                  | Queue form                                          |
| ------------------------------------------------- | --------------------------------------------------- |
| "96 records corrected CONTINUATION → SECTION_HEADER" | `:by-correction CONTINUATION:SECTION_HEADER`        |
| "Weakest source: rule.entry_boundary (relabel 58%)"  | `:by-source rule.entry_boundary`                    |
| "Top relabel reason: source_disagreement"            | `:by-reason source_disagreement`                    |
| "Labels with highest correction rate: ENTRY_START"   | `:where final_label != prev_label and prev_label = 'ENTRY_START'` |
| "Imported issue: label_issue (412 records)"          | `:by-issue label_issue`                             |

This turns stats from observation into navigation, and is the single feature that makes the screen feel like a dataset debugger rather than a dashboard. (Cleanlab Studio's clickable analytics is the precedent.)

Example:

```
Reviewed: 1,000 / 8,200

Accepted: 720    Relabeled: 210    Rejected: 70

Top relabel reasons:                                       [press Enter to drill in]
  header_disagreement       61%
  low_confidence            42%
▸ source_disagreement       39%

Top corrections:
  CONTINUATION → SECTION_HEADER     96
  ENTRY_START  → CONTINUATION       41

Weakest source: rule.entry_boundary (relabel rate 58%)
Suggested next queue: by-source:rule.entry_boundary
```

### 10.9 Export

Required formats:

**MVP formats:**

- JSONL (clean reviewed records)
- CSV
- Review log export (full audit trail)
- Stats report export (Markdown)

**MVP dataset shapes:**

- Single-label classification
- Boundary classification (line + label, with optional document grouping)

**V1:**

- Train / dev / test split with configurable ratio
- Multi-label classification export shape
- Stratified splitting

**V2:**

- Hugging Face `datasets`-compatible JSONL
- Label Studio JSON import/export
- Doccano JSONL import/export

## 11. Data model

The data model is the foundation of every other feature. Defined as TypeBox schemas at runtime (aligned with `pi-ai`'s schema system); documented here as TypeScript-ish for clarity.

### 11.1 Input record (JSONL line)

The minimum required fields. LabelLens auto-detects field names with overrides in config.

```ts
type InputRecord = {
  id?: string;              // auto-generated if absent
  text: string;             // the candidate text — required
  context_before?: string;  // optional preceding context (esp. boundary tasks)
  context_after?: string;   // optional following context
  predictions?: Prediction[];
  issues?: Issue[];         // pre-computed (e.g., from Cleanlab)
  meta?: Record<string, unknown>;  // anything else, preserved on export
};

type Prediction = {
  label: string | string[];  // string[] for multi-label
  confidence?: number;       // 0..1
  source: string;            // 'llm:gpt-4', 'rule.entry_boundary', etc.
  reason?: string;           // 'low_confidence', etc.
};

type Issue = {
  type: 'label_issue' | 'ambiguous' | 'duplicate' | 'outlier' | string;
  score?: number;
};
```

A record with a single string label and nothing else is also valid — LabelLens treats that as a single prediction with unknown source.

### 11.1.1 Identity (stable IDs)

LabelLens **never uses row index as a record's primary identity** — row index is unstable across source-file edits and would silently corrupt review state when records are added, removed, or rewritten.

ID resolution at ingest:

1. If the input record has a non-empty `id` field, that value is used verbatim.
2. Otherwise, LabelLens computes:

   ```
   id = sha256(normalize(text) + "\x1f" + normalize(context_before ?? "") + "\x1f" + normalize(context_after ?? ""))
   ```

   `normalize` lowercases, collapses whitespace, and trims. The unit-separator `\x1f` prevents collisions between adjacent fields. Context is included so identical lines in different documents produce different IDs (essential for the boundary task).

3. Collisions (true duplicates) are surfaced as `exact_duplicate` issues, not silently merged.

**Consequence for re-ingestion.** When a content-derived ID is in use, editing the source text of a record produces a *new* record from LabelLens's perspective. The old reviewed record becomes orphaned (preserved but no longer matched). The merge prompt in §13 surfaces this explicitly so the user is never surprised.

Users who need durable identity across text edits should add their own `id` field upstream.

### 11.2 Review log entry

Stored in SQLite. One row per review action (insert-only; corrections are new rows).

```ts
type ReviewEntry = {
  id: string;
  record_id: string;
  status: 'accepted' | 'relabeled' | 'rejected' | 'skipped';
  final_label: string | string[] | null;
  prev_label: string | string[] | null;
  note: string | null;
  reviewed_at: string;     // ISO 8601
  source_of_truth: 'human' | 'human+assistant';
};
```

### 11.3 Export shape

Default JSONL export of accepted/relabeled records:

```ts
type ExportRecord = {
  id: string;
  text: string;
  label: string | string[];
  reviewed_at: string;
  meta?: Record<string, unknown>;  // preserved from input
};
```

Review-log export includes the full history. Stats export is Markdown.

### 11.4 Resolved semantics

A few product-visible data-model questions need explicit answers so behavior is predictable:

- **Multiple predictions per record.** When a record has more than one `Prediction`, LabelLens picks the one with the highest `confidence` as the **primary**. Missing confidence loses to any numeric value. Ties fall back to array order. The review screen shows the primary prominently on the label list (with `▸` and confidence %); alternatives render in a one-line strip immediately below the focus box (e.g. `also: regex.tx → utility (no conf) · model_v1 → food (0.31)`). The strip is keyboard-navigable so the reviewer can swap which prediction the primary view tracks without changing data.
- **Rejected records on export.** Records with state `rejected` are **excluded** from the default JSONL export. They remain in the review log. A separate `--include-rejected` flag emits them with `label: null` for callers who need them.
- **Skipped records — distinct state.** `skipped` is its **own** review state. It is **not** counted as `pending` and does **not** appear in the `pending` queue. Skipped records live in a dedicated `skipped` queue and are surfaced separately on the stats screen. Progress display reads `Reviewed: A+R+J / Total · Skipped: K · Pending: P`. Default JSONL export still excludes skipped records. See ADR 0003.
- **Undo and accept-then-relabel.** The review log is insert-only (each action is a new row). The current state of a record is the most recent non-undone entry. `u` (undo) inserts a compensating entry rather than deleting; the prior state is recoverable.
- **Label set changes mid-review.** If the user adds a label to the config after reviews already exist, existing reviews remain valid. If the user **removes or renames** a label that has been used, LabelLens refuses to start and prints which records reference the missing label. The error message points at `labellens migrate --rename <old>:<new>` for renames — that command updates predictions, annotations, and the review log atomically, with a `.labellens.bak/` backup before commit. Removes still require a manual decision (re-ingest fresh, or remap to another label via `migrate --rename`). No silent migrations.

## 12. Configuration

LabelLens reads `labellens.config.json` from the dataset directory by default. `labellens.config.ts` is supported for users who want type-safe authoring with `defineConfig`, but the **default and the format produced by `labellens init` is JSON** — no TS-runtime evaluation needed in the compiled binary, and config inspection stays trivial on locked-down machines or over SSH.

```jsonc
// labellens.config.json
{
  "task": "classification",                   // "classification" | "multi-label" (V1) | "boundary"

  // Two label forms are supported. Strings auto-assign a number key and color from a
  // built-in palette. Use the object form to override the shortcut key, color, or both.
  "labels": [
    "food",
    "travel",
    { "name": "shopping", "key": "s", "color": "#e07b39" },
    { "name": "utility",  "key": "u" },
    "salary",
    "rent",
    "other"
  ],

  "guidelines": "./guidelines.md",            // path or inline string
  "input": {
    "path": "./transactions.jsonl",
    "format": "jsonl",
    "fields": {
      "text": "description",
      "prediction": "llm_label",
      "confidence": "llm_confidence",
      "source": "llm:gpt-4"
    }
  },
  "assistant": {
    "enabled": true,
    "provider": "anthropic",                  // any pi-ai provider
    "model": "claude-sonnet-4-5",
    "auth": "api-key",                        // "api-key" | "subscription" | "local" — see §10.5 for SSH caveats
    "mode": "remote"                          // "local" (Ollama) | "remote"
  },
  "display": {
    "color": "auto",                          // "auto" | "truecolor" | "256" | "16" | "mono"
    "banding": "auto",                        // "auto" | "on" | "off" — record-grouping background bands
    "focusBox": true,                         // draw a bounding box around the focused record
    "candidatePin": 0.4                       // viewport position (0..1) where the focused record is anchored
  },
  "output": {
    "path": "./reviewed.jsonl",
    "format": "jsonl"
  }
}
```

`labellens init` scans the input file and writes this file with sensible inferred values. The user reviews and confirms before any data is ingested.

### 12.1 Schema inference rules

To make the 2-minute activation goal concrete, `labellens init` infers field mappings from the input JSONL using a fixed candidate-name list per concept. First match wins:

| Concept          | Candidate field names (in priority order)                                                |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `text`           | `text`, `content`, `body`, `message`, `description`, `line`, `input`                     |
| `prediction`     | `prediction`, `predicted_label`, `label`, `llm_label`, `predicted`, `category`, `class`  |
| `confidence`     | `confidence`, `score`, `probability`, `prob`, `llm_confidence`, `pred_confidence`        |
| `source`         | `source`, `prediction_source`, `label_source`, `model`, `predictor`                      |
| `context_before` | `context_before`, `before`, `prev`, `previous`, `previous_text`                          |
| `context_after`  | `context_after`, `after`, `next`, `next_text`                                            |
| `id`             | `id`, `uuid`, `record_id`, `_id`                                                          |

If `text` cannot be inferred, `init` prints the available top-level fields from the first 100 records and asks the user to pick. Other fields silently default to absent (and are filled in by the user if needed).

Inferred config is written to disk as JSON. The user can edit it before confirming — nothing is irreversible.

## 13. Persistence and storage layout

Sidecar `.labellens/` directory next to the source dataset:

```
my-project/
├── transactions.jsonl              # source (immutable, never modified)
├── labellens.config.ts             # config
├── guidelines.md                   # task instructions
└── .labellens/
    ├── state.db                    # SQLite — review state, predictions, issues, assistant cache
    ├── exports/                    # generated exports
    └── logs/                       # session logs
```

**Source data is never mutated.** All review state lives in `.labellens/state.db`.

### Why sidecar over central directory

- Move the dataset, the review state moves with it.
- `git status` shows unreviewed work in the project.
- No "which db has reviews for this file?" ambiguity.
- Backup is whatever already exists for the source file.
- The source file stays git-friendly; the binary db file is `.gitignore`d.

### Why SQLite (via `bun:sqlite` + drizzle-orm)

- `bun:sqlite` is built into Bun — no native module dependency, bundles cleanly into `--compile` binary. Synchronous and fast — fits the TUI hot path.
- **Drizzle ORM** (`drizzle-orm/bun-sqlite`) sits on top for type-safe schema + query building. Schema in `src/store/schema.ts` is the source of truth; `drizzle-kit` generates SQL migrations under `migration/`. Migrations are bundled into the compiled binary via Bun `--define` (per ADR 0005). `applyMigrations()` runs automatically on every `openDb()` — idempotent across launches.
- Indexed queries make queues, filters, and stats trivial.
- Scales comfortably to 10K records (target) and well beyond.

### Schema (sketch)

The authoritative schema lives in `src/store/schema.ts` as drizzle table defs. SQL emitted by `drizzle-kit generate`:

```sql
records (id, source_path, row_index, text, context_before, context_after, raw JSON);
predictions (id, record_id, label, confidence, source, reason, raw JSON);
reviews (id, record_id, status, final_label, prev_label, note, reviewed_at, source_of_truth);
issues (id, record_id, type, score);                      -- slice 6 / #10
assistant_queries (id, record_id, prompt_hash, response JSON, created_at);  -- slice 11 / #7
sessions (id, started_at, ended_at, action_count);

-- view: every record joined to its primary prediction (window function picks the row)
CREATE VIEW records_with_primary AS
  SELECT records.*, p.* FROM records LEFT JOIN (
    SELECT *, ROW_NUMBER() OVER (
      PARTITION BY record_id ORDER BY (confidence IS NULL), confidence DESC, id ASC
    ) rn FROM predictions
  ) p ON p.record_id = records.id AND p.rn = 1;

-- indexes
CREATE INDEX idx_reviews_status ON reviews(status);
CREATE INDEX idx_predictions_confidence ON predictions(confidence);
CREATE INDEX idx_predictions_source ON predictions(source);
CREATE INDEX idx_issues_type ON issues(type);
```

### Ingest

Source files are read as a **streaming JSONL parse** — records are processed one at a time, never loading the full file into memory. This keeps the resident set small even on larger-than-target datasets and aligns with the "runs anywhere" principle.

Heavy ingest work (hashing, optional embeddings) runs in a Bun `Worker` (see §10.4). The main thread shows progress and remains responsive.

Hashing for stable IDs (§11.1.1) happens once at ingest. Records use SQLite as the canonical store; the source JSONL is read once and never touched after.

### Re-ingestion behavior (MVP)

When the source file changes (different mtime or content hash) and the user opens LabelLens, the tool diffs the new ingest against the existing `state.db` keyed on the content-hash IDs from §11.1.1, partitions the diff into three buckets, and prompts:

```
Source file has changed since last review.

  482 records — predictions[] changed only (text/context unchanged)
   18 records — text or context changed → 18 prior reviews would orphan
    6 records — new (no matching prior record)

  [r] Refresh predictions, keep reviews, accept orphans + new records
  [f] Fresh re-ingest, back up .labellens/ → .labellens.bak/   (legacy)
  [c] Cancel
```

The smart `[r]` path is the default because the common workflow — "review N records, upgrade the labeling LLM, re-run on the same texts" — must not silently discard reviews. When every ID still matches and only `predictions[]` changed, reviews and annotations are kept untouched and predictions are refreshed in place. When some IDs no longer match, those prior records become **orphans** (preserved in the database, not destroyed; see ADR 0001) and the user confirms before commit. The legacy `[f]` fresh-ingest path remains as the explicit escape hatch.

Smart merging that *rebinds* orphans across text edits — preserving reviews across edits via fuzzy text match, soft-deleting truly removed records, surfacing newly-added records — is still **V1 work** (see §18). The MVP smart re-ingest only avoids creating orphans when text didn't change; it does not try to recover orphans once they exist. See ADR 0002.

Detection uses a per-source fingerprint stored in `ingest_fingerprints` (sha256 of file content + `<mtimeMs>:<sizeBytes>` token). The sha256 is the authority on content equality; mtime+size is a fast-path skip. Filesystems with coarse mtime granularity (FAT32, some network mounts) can still rely on the sha256 to catch content changes — a stale mtime won't mask a real edit.

## 14. Key screens

### 14.1 Review screen

The layout draws from three sources: k9s (thin top strip with context + key hints, no boxed header), Argilla (predicted label marked inline on the label list with confidence percentage), and Prodigy (recent-decision history strip, clickable to revisit).

```
 LabelLens · transactions.jsonl                          412 / 8,200  · :  ?
 queue: low-confidence                                                · / e

   UPI/9876543210/Zomato                                        [dim band]
   NEFT/HDFC/SwiggyBangalore/Order#12345                        [med band]

  ╭──────────────────────────────────────────────────────────╮
  │ Senior Software Engineer at Acme Corporation,            │ [highlight]
  │ leading the platform infrastructure team responsible     │
  │ for migrating the monolithic application                 │
  ╰──────────────────────────────────────────────────────────╯
  src llm:gpt-4   ⚠ source-disagreement (0.71)   ⓘ ambiguous (0.41)

   IMPS/Razorpay/Netflix                                        [med band]
   UPI/8765432109/Swiggy                                        [dim band]

 ─ history ─────────────────────────────────────────────────────────────────
   r0411 → travel   ·   r0410 ✓ food   ·   r0409 → other   ·   r0408 ✗ skip
                                                          (click or u to undo)
 ───────────────────────────────────────────────────────────────────────────
   ▸1 food (42%)   2 travel   3 shopping   4 utility   5 salary   6 rent   7 other
   a accept   r relabel   x reject   s skip   m mark   n note   i ask   :
```

**Reading the layout:**

- **Line 1–2 (top strip):** Dataset name and progress on the left of line 1; `:` (command palette) and `?` (contextual help) hinted on the right. Queue name on line 2 left; primary single-letter actions (`/` search, `e` export) on the right. No box-drawing chrome — the top strip is whitespace-bounded, not bordered. (k9s pattern.)
- **Context-and-candidate region:** Banded record rendering per §14.5. The focused record carries a focus box; surrounding records carry alternating band tints; viewport pins the focus to ~40% from the top.
- **Metadata strip below the focus box:** Source plus per-record issue badges, one per issue type, each with a score. No "prediction" header, no separate prediction pane — the prediction is on the label list (next).
- **Alternatives strip (multi-prediction):** When a record carries more than one prediction, an additional one-line strip renders below the metadata strip listing the non-primary predictions: `also: regex.tx → utility (no conf) · model_v1 → food (0.31)`. The strip is keyboard-navigable (`[`/`]` cycles primary view across predictions without committing); selecting an alternative only changes which prediction the headline tracks, not the data.
- **Boundary-task navigation:** `j`/`k` follows queue order even when the queue is filtered (e.g. `low-confidence`). Context strip shows ±N lines from the same source document. When `±N` isn't enough, `g d` opens a full-document view scrolled to the candidate line — escape hatch for boundary decisions that depend on a section header 30 lines up. Doc-mode is exit-only via `Esc` back to the queue.
- **History strip:** Last 4–5 decisions, each shown as `<record-id> <action-symbol> <label>`. Click any entry (or press `u`) to revisit. (Prodigy pattern.)
- **Label list:** Number keys 1–9 prefix each label, with the predicted label marked by a `▸` and its confidence percentage. Pressing `1` here is functionally identical to `a` because the model's prediction is on label 1 — the keystrokes coincide. (Argilla pattern.)
- **Action bar:** Single-letter shortcuts. `m` is the mark/Needs-Review tag (additive, not a status). `:` opens the command palette. `?` is the contextual help (shown in the top strip).

For the **boundary task**, see §14.5 — the rendering strategy preserves vertical context with the candidate anchored at a stable viewport position.

### 14.2 Queue overlay

Switch active queue without leaving Review. `Shift+Q` and bare `:queue` open a modal overlay on top of the current Review screen; `j`/`k` move through built-in queues, `Enter` selects a non-empty queue and closes the overlay, and `Esc`/`q` cancel back to Review. Empty queues stay open on `Enter` so the reviewer can pick another queue. The overlay shows queue counts, progress bars, and a first-record preview for the highlighted queue.

### 14.3 Stats screen

See Section 10.8.

### 14.4 Assistant panel

Slides in from the right of the review screen. Shows streaming reasoning, evidence for/against, recommended action. Reviewer can `Enter` to accept the suggestion (still records as human action) or `Esc` to dismiss.

The streaming response uses OpenTUI's `MarkdownRenderable` in **streaming mode** (`{ streaming: true, internalBlockMode: 'top-level' }`), mounted inside a `ScrollbackSurface`. As tokens arrive, blocks settle in order — heading, then paragraph, then fenced code block — and the renderable exposes `_stableBlockCount`: the number of head-of-tree blocks that are no longer growing. The panel commits each newly-stable block to scrollback as it seals, which gives flicker-free token-by-token rendering with proper tree-sitter highlighting on fenced code once the closing fence arrives. (This is the pattern OpenTUI's docs explicitly recommend for streaming markdown.) The renderer needs `screenMode: 'split-footer'` and `externalOutputMode: 'capture-stdout'` for `ScrollbackSurface` to work — both are renderer-level options set at construction.

The same `MarkdownRenderable` powers the guidelines viewer (`g`) when guidelines are provided as Markdown, but in non-streaming mode (the file is already complete). Users who prefer a paginated reading experience can open guidelines in `less` via `:help guidelines`.

Both surfaces require the OpenTUI tree-sitter worker (`parser.worker.js`) to be present alongside the binary at runtime — see §16.1 for the build/release operational requirement.

### 14.5 Rendering strategy

Long candidate text and variable-length records can break a fixed-row layout. LabelLens uses a layered approach: structural cues that work in every terminal, with visual enhancements where the terminal supports them.

**Wrapping over horizontal scroll.** Long lines wrap into multiple visual rows rather than scroll horizontally. Reviewers read records as prose; pre-record-bounded grouping comes from background banding and the focus box rather than from row position.

**Record banding.** Each record gets a subtle background tint, alternating between two values so adjacent records are visually distinct. Wrapped continuation rows inherit their record's tint, so a 3-row record reads as one block. Optional intensity gradient: rows immediately adjacent to the candidate render slightly brighter than rows further away, giving a sense of context-window depth without explicit row labels.

**Focus box.** The currently-focused record is wrapped in a light box-drawing border (`╭─╮ │ ╰─╯`). The box moves with `j`/`k` and is the primary "where am I" cue. Border color is a soft accent foreground (not another shade of the band) so it remains visible even when banding is muted or absent.

**Viewport pinning.** As the user navigates with `j`/`k`, the viewport scrolls so the focused record's first visual row sits at a configurable position (default `display.candidatePin = 0.4`, i.e. 40% from the top). The reviewer's eyes stay calibrated to the same screen position regardless of how tall surrounding records are.

**Capability detection and fallback.** At startup, LabelLens reads `$COLORTERM` and `$TERM` and classifies the terminal as `truecolor`, `256`, `16`, or `mono`. The rendering layer adapts:

| Capability | Banding | Focus box | Notes                                                   |
| ---------- | ------- | --------- | ------------------------------------------------------- |
| truecolor  | Subtle band differences (small luminance deltas) | Accent border | Best appearance |
| 256        | Aggressive band differences (≥ 20% luminance delta) so they survive 256-cube quantization | Accent border | Default for most modern terminals |
| 16         | Off; left-edge marker characters (`│` / `▶`) substitute | Plain border | Reliable on basic terminals and over many SSH transports |
| mono       | Off; markers only | Plain border with bold candidate | Last-resort fallback |

Users can force a level via `display.color` in config; banding can be disabled via `display.banding = 'off'` independent of color level.

**Light vs dark palette detection.** Color capability is one axis; theme polarity is another. At startup the renderer calls `await renderer.waitForThemeMode(200)`, which uses DEC 2031 with an OSC fallback to report `'light' | 'dark' | null` (the timeout falls through if the terminal doesn't respond). The detected mode picks which direction the banding luminance deltas go and which accent foreground is readable. A `display.theme = 'auto' | 'light' | 'dark'` config override is supported. **MVP detects once at startup**; live OS-theme tracking (subscribing to `theme_mode` events as ghui does with its `systemThemeAutoReload` flag) is a V1 add for long review sessions that span sunset.

**Responsive layout.** The §14.1 layout stacks context-before, candidate, and context-after vertically. On wide terminals (≥160 columns) a side-by-side layout — prev-context on the left, focused candidate centered (viewport-pinned), history strip + metadata + label list on the right — is more efficient. Slice 3.1 (issue #27) ships split-vs-stack as a single component-level decision in the review screen, keyed on `renderer.terminalWidth` and re-evaluated every render (resize-aware via the renderer's `"resize"` event). Reviewers force a layout via `display.layout = "auto" | "stack" | "split"` (default `auto`) when terminal-width detection misreports under tmux/SSH. (Hunk uses this pattern for split-vs-stack diff layout; same idea, different content.)

**Single-record example (boundary task, truecolor / 256-color terminal):**

```
   UPI/9876543210/Zomato                                       ← context, dim band
   NEFT/HDFC/SwiggyBangalore/Order#12345                       ← context, slightly brighter band

  ╭──────────────────────────────────────────────────────────╮
  │ Senior Software Engineer at Acme Corporation,            │ ← candidate, highlight band + focus box
  │ leading the platform infrastructure team responsible     │   wraps freely; band continues
  │ for migrating the monolithic application                 │
  ╰──────────────────────────────────────────────────────────╯

   IMPS/Razorpay/Netflix                                       ← context, brighter band
   UPI/8765432109/Swiggy                                       ← context, dim band
```

**Same layout, 16-color / mono fallback:**

```
   │  UPI/9876543210/Zomato
   │  NEFT/HDFC/SwiggyBangalore/Order#12345

  ┌──────────────────────────────────────────────────────────┐
  │  Senior Software Engineer at Acme Corporation,           │
  │  leading the platform infrastructure team responsible    │
  │  for migrating the monolithic application                │
  └──────────────────────────────────────────────────────────┘

   │  IMPS/Razorpay/Netflix
   │  UPI/8765432109/Swiggy
```

**Test matrix.** Rendering must be verified during development on at least: iTerm2/Terminal.app (truecolor baseline), GNOME Terminal or Konsole (Linux baseline), tmux over SSH (lossy transport case), and a basic Linux console (16-color floor). If the layout is unrecognizable in any of these, the fallback rules need adjustment before ship.

### 14.6 Command palette and contextual help

Two surfaces back the keyboard-first claim: a `:` command palette for power-user navigation, and a `?` contextual help that's scoped to the current view (k9s, lazygit, tig, visidata all use this pattern).

**Command registry.** Both surfaces are driven by a single registry of typed command objects:

```ts
type Command = {
  name: string;                    // 'queue.next', 'record.accept'
  palette?: string;                // ':queue <name>' — typed in palette; optional
  binding?: string | string[];     // 'a', 'shift+enter' — direct key; optional
  scope: 'global' | 'review' | 'queue' | 'stats' | 'palette' | 'assistant';
  hidden?: boolean;                // accessible only via binding, not listed in palette/help
  enabled?: () => boolean;         // dynamic; e.g., 'export' is disabled mid-ingest
  action: (ctx: AppContext) => void | Promise<void>;
};
```

Each screen registers its own commands at mount; the palette is the filtered subset whose `scope` matches the current screen plus all `global` scope commands; the contextual help overlay uses the same filter. This is OpenCode's `CommandProvider` pattern adapted to our scope model. Adding a new feature means registering a new `Command`, not threading a key handler through the screen tree.

**Command palette (`:`).** A type-ahead prompt over the filtered registry. Built-in palette commands include:

| Palette                    | Effect                                                 |
| -------------------------- | ------------------------------------------------------ |
| `:queue`                   | Open the Queue overlay                                 |
| `:queue <name>`            | Switch to a named queue, e.g., `:queue low-confidence` |
| `:by-source <s>`           | Filter to records from a specific source               |
| `:by-reason <r>`           | Filter to a single failure mode                        |
| `:by-label <l>`            | Filter to records carrying one label                   |
| `:by-issue <type>`         | Filter to records with a specific issue type           |
| `:marked`                  | Show records the reviewer has tagged                   |
| `:stats`                   | Open the Stats screen                                  |
| `:where`                   | Open the visual filter builder                         |
| `:where <expr>`            | Switch to a raw `where:<expr>` queue                   |
| `:export [format]`         | Export current queue or whole dataset                  |
| `:guidelines`              | Open the guidelines viewer                             |
| `:assistant on` / `off`    | Toggle the LLM assistant                               |
| `:reload`                  | Re-read the source file (re-ingestion prompt)          |
| `:help`                    | Open contextual help for the active screen             |
| `:help topics`             | Open the long-form help topic picker                   |
| `:help <topic>`            | Open a help man-page in `less`                         |

**History.** The palette remembers recent commands; `↑` / `↓` cycle through recent entries the way every shell does. History is per-session in MVP; persistent across sessions is V1.

The palette is a thin layer over commands that also have direct keys; nothing is *only* reachable via `:`. Commands and their short forms are autocompleted as the user types.

**Contextual help (`?` / `:help`).** Pressing `?` or entering bare `:help` opens an overlay listing the commands whose `scope` matches the current surface, plus globals. Review, the queue overlay, stats, and assistant each show different keys — not a global cheat sheet. (k9s, lazygit, and tig all use this pattern; visidata does the same.) Hidden commands (`hidden: true`) are excluded from the help overlay even when their scope matches.

**Long-form help via man pages (aerc pattern).** LabelLens ships its tutorial and how-tos as installable man pages (`man labellens-tutorial`, `man labellens-config`, `man labellens-keymap`, `man labellens-assistant`). From inside the TUI, `:help topics` opens the topic picker and `:help <topic>` runs `less` on the same content. This means the help system is also useful outside the TUI and integrates cleanly with the man infrastructure on Unix-like systems.

### 14.7 Navigation modes

By default `j` / `k` walk the focused queue in document (row-index) order. The reviewer can opt into a signal-weighted ordering for the `pending` queue via:

```jsonc
{
  "navigation": {
    "smartNext": true     // default: false
  }
}
```

When `navigation.smartNext` is true and the focused queue is `pending`, `j` / `k` walk a sibling `smart-pending` cursor whose `WHERE` filter matches `pending` exactly but whose `ORDER BY` is a composite signal score:

```
score = (primary_confidence < 0.4)
      + (record has ≥2 distinct prediction labels)         -- disagreement
      + (record has ≥1 row in the issues table)            -- flagged
ORDER BY score DESC, primary_confidence ASC NULLS LAST, row_index ASC
```

Unsignaled records (score = 0) sort to the tail. The status bar surfaces `▸ smart` next to the queue label whenever the mode is active so the reviewer can tell at a glance that ordering differs from document order. `shift+j` / `shift+k` are escape hatches: they always advance through the underlying `pending` cursor (document order) regardless of mode, so the reviewer can fall back to chronological scanning without toggling the config.

The mode is opt-in because it changes the *meaning* of "next" — reviewers used to walking records in source order would otherwise be surprised by the reordering. Boundary tasks ignore the flag (they need document-order context strips on every record).

## 15. Keyboard model

The keyboard model is structured around **named actions** with default bindings, not hardcoded key handlers. Each action has a stable name (`record.accept`, `queue.next`, `palette.open`); each key binding maps a key sequence to an action within a scope (`review`, `queue`, `stats`, `palette`, `assistant`, `global`). The two layers — actions and bindings — are decoupled so users can override bindings via config without touching code, and so UI hint strings (the action bar at the bottom of every screen) stay accurate when bindings change. This is the pattern Codex shipped (PR 18593) and OpenCode also uses; both arrived at the same shape independently.

**Pure-TS engine.** The keymap engine is a single zero-dependency TypeScript module:

```ts
// src/keymap/engine.ts — no imports from @opentui, no UI deps
export type Action = string;            // 'record.accept'
export type Scope = 'global' | 'review' | 'queue' | 'stats' | 'palette' | 'assistant';
export type Binding = { key: string; action: Action; scope: Scope };
export type KeyEvent = { name: string; ctrl?: boolean; shift?: boolean; meta?: boolean };

export function resolve(
  bindings: Binding[],
  scope: Scope,
  event: KeyEvent
): Action | null {
  // pure function: deterministic, testable without a terminal
}
```

Screens call `resolve(bindings, currentScope, keyEvent)` and dispatch the returned action. Tests for the engine are pure unit tests — no renderer, no fake DOM, no async, no OpenTUI imports. This is the pattern OpenCode used for its vim-mode engine (957 lines of pure TypeScript with zero imports), and it pays off for the same reason: when a binding behaves wrong, the test reproduces it as a string-in / action-out call. The engine sits behind the render-primitives wrapper in §16.1 — both are insulation layers.

**Number keys + predicted label coincidence.** Pressing the number key of the **predicted label** is functionally equivalent to `a` (accept) — the model's prediction is highlighted in the label list, and pressing its number applies the same label. Reviewers can use either keystroke; the result is identical and recorded as a human action either way. (Argilla pattern.)

**Default bindings (review scope):**

| Keys      | Action               | Description                                              |
| --------- | -------------------- | -------------------------------------------------------- |
| `a`       | `record.accept`      | Accept prediction                                        |
| `r`       | `record.relabel`     | Open fuzzy label picker                                  |
| `1`–`9`   | `record.label.N`     | Quick-relabel to label N (= accept when N is predicted)  |
| `x`       | `record.reject`      | Reject (no label)                                        |
| `s`       | `record.skip`        | Skip                                                     |
| `m`       | `record.tag.mark`    | Mark / Needs Review (additive tag, does not change status) |
| `n`       | `record.note.add`    | Add note                                                 |
| `i`       | `assistant.inquire`  | Ask LLM assistant                                        |
| `g`       | `guidelines.show`    | Show guidelines                                          |
| `q`       | `queue.switch`       | Switch queue                                             |
| `t`       | `stats.show`         | Stats screen                                             |
| `u`       | `record.undo`        | Undo last action                                         |
| `/`       | `search.open`        | Search records                                           |
| `j` / `k` | `record.next/prev`   | Next / previous record                                   |
| `e`       | `export.run`         | Export                                                   |

**Default bindings (global scope):**

| Keys      | Action               |
| --------- | -------------------- |
| `?`       | `help.contextual`    |
| `:`       | `palette.open`       |

**Config-file overrides.** Users override default bindings in `labellens.config.json`:

```jsonc
"keymap": {
  "review.record.accept": "y",          // y instead of a
  "global.palette.open": ["ctrl+p", ":"] // both work
}
```

Resolution is: defaults → user config (merged at startup, user wins). MVP supports overrides via config file only. **An interactive `:keymap` remap dialog** is V1 (the same pattern Codex shipped in PR 18594).

### Fuzzy picker

`r` opens an inline picker over the candidate area with type-ahead. The label list filters as the user types; numbered shortcuts update to match the filtered set. `Enter` selects, `Esc` cancels. Works equally well for 5 labels or 50.

### V1 keyboard additions

- **Multi-label toggle.** `Space` toggles a label on the focused record; `Enter` commits. Requires `task: 'multi-label'` in config.

## 16. Technical stack

| Concern        | Choice                                     |
| -------------- | ------------------------------------------ |
| Runtime        | Bun                                        |
| Language       | TypeScript                                 |
| TUI            | OpenTUI                                    |
| Storage        | `bun:sqlite` (runtime) + `drizzle-orm/bun-sqlite` (schema, queries, migrations) — see ADR 0005. `@libsql/client` is a dev-only dep so `drizzle-kit studio` works on Bun. |
| LLM            | `pi-ai` (provider-agnostic, OAuth subscription auth + API keys) |
| Validation     | TypeBox (aligned with `pi-ai` schemas); Zod elsewhere if useful |
| Distribution   | Bun-compiled binary + runtime assets in one install dir. **MVP**: curl-installer (primary) + npm `optionalDependencies` (secondary). **V1**: brew formula. (OpenCode pattern, staged.) |
| Targets        | macOS arm64, Linux (arm64, x64). Intel Mac (darwin-x64) intentionally not shipped as a prebuilt — see ADR 0006. |

### Constraints this implies

- **No native modules besides `bun:sqlite`.** Pure-TS dependencies only, to keep the compiled binary clean.
- **Embeddings via `pi-ai`** when needed (optional outlier/near-duplicate signals); never a Python sidecar.
- **Subscription auth state** (`pi-ai`'s `~/.pi/agent/auth.json` or equivalent) lives outside the dataset's sidecar `.labellens/` directory — it's user-scoped, not dataset-scoped.
- **Heavy CPU work runs in Bun `Worker` threads.** Hashing, signal computation, and any other multi-second computation must not block the TUI thread. Progress is streamed back via `postMessage`.
- **Streaming JSONL ingest.** Source files are parsed line-by-line, never fully loaded into memory.
- **Terminal capability detection at startup.** Read `$COLORTERM` / `$TERM`, classify into `truecolor | 256 | 16 | mono`, key the rendering strategy off this with config override (see §14.5).
- **Test SSH rendering early.** OpenTUI's GPU acceleration does not help over SSH; what matters is per-frame diff size and graceful degradation across terminal types.

### 16.1 Distribution layout and OpenTUI operational notes

LabelLens follows the **OpenCode distribution pattern**: the `bun build --compile` binary is shipped together with its runtime assets in a single install location (a brew formula, npm platform package, or curl-installer target directory). It is not a literal one-file executable. This is deliberate.

Two operational details follow from this:

**1. OpenTUI tree-sitter worker (issue [#807](https://github.com/anomalyco/opentui/issues/807)).** OpenTUI's `MarkdownRenderable`, `CodeRenderable`, and `DiffRenderable` use a tree-sitter worker (`parser.worker.js`) for syntax highlighting. Bun's `--compile` does not auto-bundle Web Worker entry points; the worker must be shipped alongside the binary in the install directory. If it isn't, syntax highlighting silently degrades to plain text — no error, no warning. OpenCode hits this same constraint and resolves it by shipping the worker file in their platform-specific package; LabelLens does the same.

**Operational requirement.** The build/release pipeline must:
- Copy `node_modules/@opentui/core/parser.worker.js` into the per-platform output directory next to the binary.
- Set `OTUI_TREE_SITTER_WORKER_PATH` in a launcher shim, or ensure the binary's process working directory contains the worker file.
- Verify that markdown rendering works in CI by running the compiled binary from a fresh location (not the build directory).

**2. Native libraries.** OpenTUI's Zig core ships as a pre-built native library inside `@opentui/core`. Bun's `--compile` handles this correctly when the npm package is present at compile time, but the resulting binary is platform-specific. We compile separately for each `(os, arch)` target and publish them as optional npm sub-packages (`labellens-darwin-arm64`, `labellens-linux-x64`, etc.), with a top-level `labellens` package that selects the right one at install time.

**Risk register for OpenTUI dependency:**

| Risk                                                | Probability | Impact                          | Mitigation                                                                |
| --------------------------------------------------- | ----------- | ------------------------------- | ------------------------------------------------------------------------- |
| Worker bundling regression in newer OpenTUI/Bun     | Medium      | Markdown rendering breaks in compiled binary | Pin OpenTUI version; CI test from a fresh directory before release  |
| OpenTUI 0.x API churn between minor versions        | Medium      | Refactor cost when upgrading    | Wrap OpenTUI components behind 4–6 internal primitives (see below)        |
| Bun version pinning issue (compiled-with vs system) | Low         | Behavior drift on certain hosts | Match OpenCode's pattern: ship Bun runtime with the binary; document target Bun version |
| OpenTUI dropping Solid/React reconciler maintenance | Low         | Have to migrate or fork         | Use the imperative core API; reconcilers are optional layers                |
| Issue #807 not fixed upstream                       | Already real | None — already mitigated        | Ship parser.worker.js (already in our pipeline)                           |

**Render primitives wrapper.** Instead of importing `Box`, `Text`, `Input`, `ScrollBox`, `Select`, and `Portal` directly throughout the code, LabelLens wraps each in a thin internal module (`src/render/box.ts`, `src/render/text.ts`, etc.). This is 4–6 small files, each one a passthrough plus the project's color/theme conventions. The wrapper exists so that if OpenTUI ships a breaking change between 0.x versions, or if we ever swap to Ink or pi-tui, the migration is one layer of work rather than a global rewrite. This is also where the worker-path/asset-path conventions live, so individual screens never have to know about distribution mechanics.

**OpenTUI built-in features we rely on, beyond the rendering primitives:**

- **OSC 52 clipboard** via `renderer.copyToClipboardOSC52(text)` and `renderer.clearClipboardOSC52()`. Works over SSH on most modern terminals. Wired to actions like `record.copy-text` (yank the candidate), `record.copy-diff` (yank predicted-vs-corrected as text), and `export.copy` (yank the current queue's export string).
- **Terminal title** via `renderer.setTerminalTitle(...)`. Set at startup to `LabelLens · {dataset-basename} · {reviewed}/{total}`; updated as progress changes. Polishes the terminal-tab and Tmux window-title experience.
- **Bracketed paste support.** Paste arrives as a single `paste` event with the full pasted text — important for the fuzzy picker, search input, and note entry, where parsing pastes character-by-character through the keymap engine would mangle them.
- **Theme detection.** `await renderer.waitForThemeMode(200)` at startup picks the light/dark palette; the `theme_mode` event covers live-tracking for V1 (see §14.5).

**Bootstrap.** The repo skeleton starts from `bun create tui -t core my-project` (the imperative-API template, matching our chosen stack — not the React or Solid ones). For development, install the `msmps/opentui-skill` Claude Code / Cursor skill (`npx skills add anomalyco/opentui --skill opentui`) — it teaches the agent OpenTUI's APIs, gotchas, and the per-framework reference layout. OpenCode itself uses the same install command.

### Scale envelope (MVP)

Honest performance targets — small enough to be testable, broad enough not to over-promise:

| Dimension                        | MVP target                                       |
| -------------------------------- | ------------------------------------------------ |
| Records per dataset              | 1K–50K (10K is the canonical target)             |
| Labels per task                  | No hard cap (number keys 1–9, fuzzy picker beyond); structural label sets for boundary |
| Predictions per record           | ≤10                                              |
| Candidate text size              | Display-truncated at ~5KB; full text retained in DB and exported intact |
| Ingest time                      | Under 30s for 10K records (no embeddings)        |
| Queue switch latency             | Under 200ms at 50K records                       |
| Keystroke-to-render              | Under 50ms locally; under 100ms over typical SSH |
| Export                           | Under 10s for 50K records                        |

These are commitments, not aspirations. If a feature can't fit inside the envelope, it doesn't ship in MVP.

## 17. Competitive differentiation

| Competitor              | What to learn from it                                       | Where LabelLens differs                                                   |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| Label Studio            | Pre-annotation, ML-assisted labeling                        | One-step install, no server, terminal-first, review-loop-focused          |
| Argilla                 | Prediction vs annotation separation, suggestions            | No platform overhead, local-first, file-native                            |
| Prodigy                 | Mature NLP recipes, scriptable, customizable                | Use Prodigy if you want supported commercial NLP workflows or custom Python recipes; use LabelLens if your data is JSONL/CSV, your task is classification-style review, you want no browser/server, and your priority is rapidly reviewing noisy predictions over SSH or on private files |
| Doccano                 | Simple text task taxonomy                                   | Pre-labeled-data review, not blank annotation                             |
| Cleanlab                | Label issue, ambiguity, duplicate, outlier detection        | Native lightweight prioritization signals in TS; imports Cleanlab scores when richer audits are needed |
| Custom CLI / one-off    | Flexible, fits exactly one dataset                          | Reusable across datasets; queues, stats, assistant out of the box         |
| LLM-coded one-off CLI   | ~20 minutes to vibe-code with Claude Code                   | First-class data model, prediction metadata, queues, stats; not throwaway |

The honest answer to "why not vibe-code this in a weekend?" is that vibe-coded review CLIs lack the queue/stats/data-quality scaffolding that turns labeling from a chore into dataset debugging. LabelLens's value is the persistent layer below the review screen, not the review screen itself.

## 18. Scope by version

### MVP

The smallest version that proves the review-loop wedge while preserving the persistent scaffolding (predictions vs annotations, queues, stats) that distinguishes LabelLens from a one-off CLI.

**Tasks**

- Single-label classification (no label-count cap; number keys for first 9, fuzzy picker for the rest)
- Boundary / segmentation classification

**Core review loop**

- Schema inference via `labellens init` (JSON config, candidate-field inference per §12.1)
- Sidecar SQLite storage with prediction-vs-annotation separation
- Confidence / source / reason / imported-issue display, context before/after
- Accept / reject / relabel (1–9) / skip / note / undo
- Queues: pending, low-confidence, disagreements, flagged, marked, by-source, by-reason, by-label, by-issue
- Prioritization signals (§10.4 MVP set): confidence, source disagreement, exact duplicate
- Imported issue scores from input JSONL (read-only passthrough)

**Surfaces**

- Review screen with rendering strategy (§14.5)
- Queue overlay
- Stats screen with corrections, source-quality, reason breakdown, imported-issue counts
- Guidelines viewer

**LLM assistant**

- `pi-ai` integration, BYO-LLM (API key / subscription / Ollama), off by default, structured output, query caching, explicit privacy notice on first enable

**Output**

- Clean JSONL / CSV export
- Review log export (full audit trail)
- Stats report (Markdown)

**Operations**

- Streaming JSONL ingest, Worker-based scoring
- Re-ingestion prompt: re-ingest fresh with backup of prior `.labellens/` (no merge in MVP)
- Per-platform Bun-compiled binary distribution with bundled OpenTUI assets via **curl-installer (primary)** and **npm `optionalDependencies` (secondary)**; macOS arm64/x64, Linux arm64/x64. Brew formula deferred to V1 — needs tap maintenance and adds a third release pipeline.
- Terminal capability detection with documented fallback levels

### V1

Larger features deferred until the MVP loop is polished.

- Multi-label classification (with toggle UI and `Space`/`Enter` semantics)
- Smart re-ingestion merge (preserve reviews across edits, soft-delete removed records, surface new ones)
- Near-duplicate detection via MinHash; conflicting-duplicate flagging
- Optional embedding-based signals (outliers, semantic near-duplicates) via `pi-ai`
- Train / dev / test split with stratified option
- Multi-label export shape
- CSV import (with inference rules extended)
- Extraction review (form-style, no spans)
- Pairwise / preference review
- **Iterate-and-rescore**: after a batch of reviews, recompute prioritization signals (e.g., correction rates by source) so the queue order reflects what's been learned this session. Cleanlab Studio's "Improve Issues Found" pattern, but recompute-only — no model retraining in MVP scope or V1.
- **Threshold-based bulk action ("Clean Top K")**: from any filtered/sorted queue, accept (or mark / exclude) the top N records that meet a confidence or score threshold, with explicit confirmation showing the affected count. Cleanlab Studio pattern.
- Active-learning-style queue ordering (re-prioritize after each individual review, not only at batch boundaries)
- Hugging Face / spaCy-friendly export shapes
- Streaming assistant UI niceties; subscription OAuth headless code-paste flow once `pi-ai` upstream stabilizes
- **Brew formula and tap.** Third distribution channel after curl + npm prove out in MVP.

### V2 / future

- NER / span review (technical risk; see Section 19)
- Label Studio / Doccano import-export bridges
- Inter-session quality comparison (this review pass vs last)
- Multi-dataset workspace
- Optional remote sync for personal use across machines
- **LabelLens MCP server.** Expose review state via an MCP daemon — list pending records, fetch one by ID, submit annotations, query stats — so coding agents can drive review headlessly while a human supervises in another terminal. (Hunk's MCP daemon pattern; pairs naturally with the data model already in §11.)
- **Agent skill (`labellens-review/SKILL.md`).** A skill file that an LLM agent loads to understand how to interact with a live LabelLens session via the MCP server. Same shape as Hunk's `skills/hunk-review/SKILL.md`. Lets a coding agent help triage a queue under human direction.

## 19. Why NER and extraction-with-spans are deferred

The deferral is technical, not philosophical.

**Character-precise span selection over wrapped text is the hard problem in TUIs.**

- Mouse support is inconsistent across terminals and frequently broken over SSH.
- Keyboard span selection requires modes (enter selection mode, mark start, move, mark end, assign label) and editing existing spans is fiddly.
- Text wrapping breaks naive selection: a span across two visual rows requires tracking logical character offsets while rendering visual highlights across wrapped rows. OpenTUI is early enough that this primitive likely needs to be built in-house.
- Overlapping/nested spans render poorly in monospace.

The opportunity cost of building span infrastructure in MVP is the review loop, queues, stats, and assistant — which are where the actual differentiation lives. NER returns in V2 once the core loop is proven and OpenTUI has matured.

Extraction review (structured field correction) is form-style — much more tractable — so it lands in V1.

## 20. Success metrics

### Activation

- User opens a dataset and reviews their first record within 2 minutes of running `labellens init`.
- Schema inference produces a usable config without edits in ≥80% of common JSONL shapes.
- User exports clean labels after their first review session.

### Review productivity

- Median records reviewed per minute: ≥30 for single-label, ≥10 for boundary.
- Percentage of records resolved with a single keystroke (accept): ≥50% for low-noise datasets.
- Time to resolve an ambiguous record (with assistant): ≤30 seconds.

### Dataset quality

- Relabel rate by source (visible to user as a feedback signal on their pipeline).
- Reduction in suspected label issues after review.
- Number of conflicting duplicates resolved.

### Adoption (since the goal is a polished release)

- GitHub stars / forks (vanity, but real).
- Number of unique users running `labellens init`.
- Number of datasets reviewed per user (retention proxy).
- Assistant usage rate (depth-of-feature proxy).

## 21. Product principles

1. **Review, not annotation platform.** Optimize for pre-labeled data.
2. **Human is final authority.** LLMs and quality scores assist; never auto-rewrite labels.
3. **Local-first.** Data, review state, and exports stay on the machine. Network use is opt-in (only when the LLM assistant is explicitly enabled).
4. **File-native.** Bring JSONL/CSV; leave with clean JSONL/CSV.
5. **Keyboard-first.** Faster than browser or spreadsheet.
6. **Context-first.** Surrounding lines and metadata are part of the decision.
7. **Quality-aware.** Surface the highest-value records first.
8. **One-step install, no runtime dependencies.** Bun-compiled binary plus its OpenTUI assets, installed in one location; no Node.js or Python on the host. Runs over SSH.
9. **BYO-LLM.** Provider-agnostic; subscription OAuth, API keys, and local models all supported via `pi-ai`.
10. **Interoperable.** Plays nicely with Cleanlab scores, Hugging Face exports, and existing pipelines.

## 22. Promise

```
Load noisy labels.
Review the uncertain ones fast.
Export clean training data.
```

## 23. One-line summary

A terminal-first, one-step-install, local-first review tool for developers cleaning LLM-, rule-, and model-labeled text datasets, with prediction metadata, context-aware review, prioritization signals, optional LLM assistance, and training-ready exports.
