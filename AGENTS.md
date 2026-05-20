# LabelLens — agent orientation

Terminal-first review tool for noisy text training data. Reviews pre-labeled records — not a general annotation platform, not for blank-data labeling, not a team workforce tool (PRD §5). You're inside the repo. This file is the map.

## Read in this order

1. [`PRD.md`](./PRD.md) — full product spec (v2.9). Authoritative for behaviour.
2. [`CONTEXT.md`](./CONTEXT.md) — domain glossary. Use these terms in code, comments, commit messages, PRs. Each `_Avoid_` line lists the alternatives to refuse.
3. [`docs/explanation/architecture.md`](./docs/explanation/architecture.md) — module layout, data flow, key seams, diagrams. The map.
4. [`docs/adr/`](./docs/adr/) — load-bearing decisions, ADRs 0001 – 0015. Don't relitigate without superseding.
5. [`docs/`](./docs/index.md) — user-facing reference (config schema, keybindings, queue grammar, CLI flags, output formats). The same content the README links to.
6. [`CONTRIBUTING.md`](./CONTRIBUTING.md) — dev loop, paseo worktrees, testing, commit conventions.

When you need depth on a topic, follow the link instead of reading from memory. The above files are the source of truth; this file is a pointer.

## Stack

- Bun + TypeScript.
- OpenTUI (imperative core API; bootstrap from `bun create tui -t core`).
- `bun:sqlite` (runtime) + `drizzle-orm/bun-sqlite` (schema, queries, migrations) — see ADR 0005. Schema in [`src/store/schema.ts`](./src/store/schema.ts); migrations under [`migration/`](./migration/); bundled into the compiled binary via Bun `--define`. `@libsql/client` is dev-only (powers `drizzle-kit studio`).
- `@earendil-works/pi-ai` for the LLM assistant (slice 11).
- TypeBox schemas (aligned with `pi-ai`).
- Pure-TS keymap engine (PRD §15) — no UI deps, deterministic, unit-testable.

Render primitives wrap OpenTUI components in [`src/render/`](./src/render/) (4–6 small files) so OpenTUI version churn is one layer of work, not a global rewrite. See PRD §16.1.

## Load-bearing conventions

These are the ones agents get wrong most often. The full set with examples lives in CONTEXT.md, ADRs, and the docs/explanation/ pages — read those before disagreeing.

- **Domain language is law.** "Annotation" means human label; "Prediction" means machine label. Don't say "label" alone unless you mean the value (`food`, `SECTION_HEADER`). See [docs/explanation/prediction-vs-annotation.md](./docs/explanation/prediction-vs-annotation.md).
- **Skipped is its own state, not a flavor of pending.** [ADR 0003](./docs/adr/0003-skipped-distinct-state.md) / [explanation](./docs/explanation/skipped-state.md).
- **Source data is immutable.** Never write back to the user's JSONL. State lives in `.labellens/state.db`.
- **Source-of-truth = `human+assistant`** whenever the assistant panel was viewed for a record, not only when accepted. [ADR 0004](./docs/adr/0004-source-of-truth-includes-viewing.md) / [explanation](./docs/explanation/assistant-audit.md).
- **"Current" Review state always reads from `effective_reviews`.** Never re-derive the "non-undone, non-compensated" predicate inline. [ADR 0007](./docs/adr/0007-effective-review-entry.md) / [explanation](./docs/explanation/effective-review.md). Audit-log surfaces (history strip, `labellens export log`) intentionally read raw `reviews`. Exports that need per-record current state should use `latestEffectiveByRecord` (one bulk query) over per-row `currentReview` calls — see [`src/export/jsonl.ts`](./src/export/jsonl.ts).
- **Modal sub-surfaces go through the Overlay seam.** Picker, Note, Assistant, Configure-Assistant share [`src/overlay/`](./src/overlay/): a pure reducer per overlay + an `applyEffects` interpreter against AppContext. Adding a modal surface = new reducer in `src/overlay/`, registered in `reduce.ts`. Async provider/timer results re-enter through events/effects. NEVER add bespoke key handlers in screens.
- **No native modules besides `bun:sqlite`.** Pure-TS deps only — keeps the compiled binary clean.
- **Heavy CPU work runs in a Bun `Worker`.** Hashing, signal computation, embeddings. Main thread stays responsive.
- **Streaming JSONL ingest.** Never load the full file into memory.
- **Stop before changing load-bearing shape.** AppContext shape, Overlay reducer base type, `effective_reviews` semantics, render primitive surface ([ADR 0010](./docs/adr/0010-render-primitives-vs-composites.md)), and schema migration shape need a written proposal or superseding ADR before code. Don't bypass with `--no-verify` or a sibling helper that re-derives the rule.
- **Smart-pending learns at commit time, undoes via memory, never reads it back from SQL.** Session-local active learning ([explanation](./docs/explanation/smart-learning.md)) samples `accepted | relabeled | rejected` decisions inside `commitDecision` *before* `insertReview`; `record.undo` reverses via `smartLearning.reverseDecision`, not by re-querying `effective_reviews`. `skipped` never feeds the sampler. New code that commits decisions outside the Overlay effect path must call `recordDecision` itself.

## Verify

- `bun run typecheck && bun run lint && bun test` — pre-commit gate (lefthook runs the same).
- `bun run schema` — after editing [`src/config/config.ts`](./src/config/config.ts).

"Done" = exit codes 0. Not "I think it works."

## Where things live

| You need | Look at |
|---|---|
| Config schema, every field | [docs/reference/config.md](./docs/reference/config.md) |
| Keybindings (every scope) | [docs/reference/keybindings.md](./docs/reference/keybindings.md) |
| Queues + `where:` grammar | [docs/reference/queues.md](./docs/reference/queues.md) |
| CLI flags / env / exit codes | [docs/reference/cli.md](./docs/reference/cli.md) |
| Output JSONL / CSV / log shape | [docs/reference/output-schema.md](./docs/reference/output-schema.md) |
| How a feature works for users | [docs/how-to/](./docs/how-to/) |
| Why a design choice was made | [docs/explanation/](./docs/explanation/) + [docs/adr/](./docs/adr/) |
| Dev loop, paseo, testing, commits | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Test harness specifics | [test/AGENTS.md](./test/AGENTS.md) |
| Display capability detection | [`src/render/capability.ts`](./src/render/capability.ts) — `bootstrapDisplay` is the production seam; `defaultDisplay()` is the test fixture. |
| Queue registration pattern | [`src/store/queues/`](./src/store/queues/) — one file per queue, register in `registry.ts`. |
| Assistant call shape | [`src/assistant/provider.ts`](./src/assistant/provider.ts) — `queryAssistant` is the single entry. ADR 0009 superseded PRD §14.4's right-side panel with an inline footer. |
| Config schema source of truth | [`src/config/config.ts`](./src/config/config.ts) — TypeBox `LabellensConfigSchema`. Run `bun run schema` after edits to refresh [`schema/labellens.config.schema.json`](./schema/labellens.config.schema.json). A unit test fails on drift. |
| Smart-pending learned weights | [`src/learning/smart-learning.ts`](./src/learning/smart-learning.ts) — pure session-local sampler. Wired into AppContext + invoked from `src/overlay/effects.ts` (commit) and `src/actions/record/undo.ts` (reverse). Query factory: `buildSmartPendingQuery` in [`src/store/queues/smart-pending.ts`](./src/store/queues/smart-pending.ts). |

## Quick rules for PRs

- Always work on a feature branch + open a PR. Never push to `main`. Don't merge your own PRs.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`). Reference issues with `closes #N`.
- No Claude / agent attribution in commits, PR bodies, or code comments. Author is the human.
- No backwards-compat shims, no dead-code comments, no feature flags. Just change the code.

## Compaction

When compacting, preserve: modified file paths, the Verify commands run with their results, and ADR numbers referenced by changed code.

Long-form workflow ([CONTRIBUTING.md](./CONTRIBUTING.md)) covers the rest.
