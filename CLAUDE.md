# LabelLens — agent orientation

You are working on **LabelLens**, a terminal-first review tool for noisy text training data. Read in this order:

1. **`PRD.md`** — full product spec (v2.7). Authoritative for behavior.
2. **`CONTEXT.md`** — domain glossary. Use these terms in code, comments, commit messages, and PR descriptions. Avoid the alternatives listed under each `_Avoid_` line.
3. **`docs/adr/`** — load-bearing decisions. ADRs 0001–0004 settle identity, re-ingest, skipped state, and assistant audit. Don't relitigate unless you're explicitly superseding one.

## Issue tracker

GitHub Issues on this repo. Two triage labels:

- `ready-for-afk` — pick up and ship without a human gate
- `hitl` — needs human verification step (auth UX, distribution smoke matrix)

Slices are tracer bullets — each cuts end-to-end through schema, store, render, action. Don't refactor for hypothetical future slices. Three similar lines beats a premature abstraction.

## Stack

- Bun + TypeScript
- OpenTUI (imperative core API; bootstrap from `bun create tui -t core`)
- `bun:sqlite` for state.db
- `pi-ai` for assistant (slice 11 only)
- TypeBox schemas (aligned with `pi-ai`)
- Pure-TS keymap engine (PRD §15) — no UI deps, deterministic, unit-testable

Render primitives wrap OpenTUI components in `src/render/` (4–6 small files) so OpenTUI version churn is one layer of work, not a global rewrite. See PRD §16.1.

## Conventions

- **Domain language is law.** "Annotation" means human label; "Prediction" means machine label. Don't say "label" alone unless you mean the value (`food`, `SECTION_HEADER`).
- **Skipped is its own state, not a flavor of pending.** ADR 0003.
- **Source data is immutable.** Never write back to the user's JSONL. State lives in `.labellens/state.db`.
- **Source-of-truth = `human+assistant`** whenever the assistant panel was viewed for a record, not only when accepted. ADR 0004.
- **No native modules besides `bun:sqlite`.** Pure-TS deps only — keeps the compiled binary clean.
- **Heavy CPU work runs in a Bun `Worker`.** Hashing, signal computation, embeddings. Main thread stays responsive.
- **Streaming JSONL ingest.** Never load the full file into memory.

## Testing

- Keymap engine: pure unit tests. String-in, action-out. No renderer.
- Storage layer: integration tests against a real `bun:sqlite` (no mocks).
- Rendering: snapshot at terminal-capability levels (truecolor, 256, 16, mono).
- Performance: shared fixtures (issue #14); perf harness (issue #15).
- SSH path matters — manually verify any rendering changes over a real SSH session before declaring a slice done.

## Commits and PRs

- Reference the issue you're closing in the PR title or body.
- Commits use conventional format. `feat:`, `fix:`, `refactor:`, `test:`, `docs:`.
- **Never add Claude / agent attribution to commits or PRs.** No `Co-Authored-By: Claude` trailers, no "🤖 Generated with Claude Code" footers, no agent-self-referential lines anywhere. The author is the human running the tool.
- Don't add backwards-compat shims, dead-code comments, or feature flags. Just change the code.
- Default to no comments. If WHY is non-obvious, one short line.
