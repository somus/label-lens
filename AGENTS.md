# LabelLens — agent orientation

You are working on **LabelLens**, a terminal-first review tool for noisy text training data. Read in this order:

1. **`PRD.md`** — full product spec (v2.7). Authoritative for behavior.
2. **`CONTEXT.md`** — domain glossary. Use these terms in code, comments, commit messages, and PR descriptions. Avoid the alternatives listed under each `_Avoid_` line.
3. **`docs/adr/`** — load-bearing decisions. ADRs 0001–0007 settle identity, re-ingest, skipped state, assistant audit, drizzle storage, no-darwin-x64-prebuilt, and effective Review entry. Don't relitigate unless you're explicitly superseding one.

## Issue tracker

GitHub Issues on this repo. Two triage labels:

- `ready-for-afk` — pick up and ship without a human gate
- `hitl` — needs human verification step (auth UX, distribution smoke matrix)

Slices are tracer bullets — each cuts end-to-end through schema, store, render, action. Don't refactor for hypothetical future slices. Three similar lines beats a premature abstraction.

## Stack

- Bun + TypeScript
- OpenTUI (imperative core API; bootstrap from `bun create tui -t core`)
- `bun:sqlite` (runtime) + `drizzle-orm/bun-sqlite` (schema, queries, migrations) — see ADR 0005. Schema in `src/store/schema.ts`; migrations under `migration/`; bundled into the compiled binary via Bun `--define`. `@libsql/client` is dev-only (powers `drizzle-kit studio`).
- `pi-ai` for assistant (slice 11 only)
- TypeBox schemas (aligned with `pi-ai`)
- Pure-TS keymap engine (PRD §15) — no UI deps, deterministic, unit-testable

Render primitives wrap OpenTUI components in `src/render/` (4–6 small files) so OpenTUI version churn is one layer of work, not a global rewrite. See PRD §16.1.

## Display config (PRD §14.5)

Terminal capability + theme are detected once at startup by `bootstrapDisplay` in `src/render/capability.ts` and threaded through `AppContext.display`. Every callsite of `createAppContext` must pass a `ResolvedDisplay` — production code calls `bootstrapDisplay`; tests use `defaultDisplay()` (mono + light) from the same module.

Users override via `labellens.config.json` `display.*`:

- `color: "auto" | "truecolor" | "256" | "16" | "mono"` — force a capability level (auto reads `$COLORTERM` / `$TERM` / `$NO_COLOR`).
- `banding: "auto" | "on" | "off"` — banded background tint per record. Always off at 16 / mono regardless of override.
- `theme: "auto" | "light" | "dark"` — auto uses `renderer.waitForThemeMode(200)` with a `light` fallback on timeout / null / rejection.
- `candidatePin: 0.05..0.95` — viewport pin position; default 0.4 = 40% from top of band region.
- `motion: "auto" | "on" | "off"` — animation feedback (fades, flashes, progress tweens). Auto enables for truecolor / 256-color terminals; forced off at 16 / mono regardless of override.

Live theme switching mid-session is a V1 follow-up (PRD §14.5).

## Queue system (PRD §10.3)

Queues are SQL queries over indexed columns; switching is a cursor swap, not a re-query of the full DB. Cursors are memoized per-queue in `AppContext` so re-entering a queue resumes at the last position. `[` / `]` cycle the static built-ins; `shift+q` opens the Queue screen with live counts.

**Built-in queues:**

- `pending` — untouched records (no effective review). Excludes `skipped` (ADR 0003).
- `skipped` — latest effective review status = `skipped`.
- `low-confidence` — unreviewed, ordered by `primary_confidence` ASC; NULL confidences sort last.
- `disagreements` — unreviewed records whose `predictions[]` carry ≥2 distinct labels.
- `flagged` — records with any row in the `issues` table (imported via JSONL `issues[]` per PRD §10.4; computed signals land in #10).
- `marked` — records tagged `marked` via the `m` key (additive; survives review state).

**Parametric factories** (resolved by `resolveQueue` parsing `<head>:<rest>`):

- `by-source:<s>` — `primary_source = <s>`. Source strings may contain `:` — the rest is reassembled (e.g. `by-source:llm:gpt-4`).
- `by-reason:<r>` — `primary_reason = <r>`.
- `by-label:<l>` — effective `final_label` if reviewed, else `primary_label`. Reviewer-set labels take precedence.
- `by-issue:<t>` — `EXISTS (issues WHERE type = <t>)`.
- `by-correction:<from>:<to>` — latest effective review flipped `<from>` → `<to>`. Drilldown target for stats. Split on the **last** colon, so colon-namespaced from-labels survive (`by-correction:policy:spam:ham` → from=`policy:spam`, to=`ham`). The to-label cannot itself contain a colon.

**Power-user `where:<expr>`:**

```
:queue where:source = 'llm:gpt-4' and confidence < 0.3
:queue where:final_label != prev_label and prev_label = 'ENTRY_START'
:queue where:issue_type in ('source_disagreement', 'low_confidence')
```

Recursive-descent parser over a strict whitelist. Columns: `status`, `final_label`, `prev_label`, `source`, `confidence`, `reason`, `issue_type`. Operators: `=`, `!=`, `<`, `<=`, `>`, `>=`, `in`. Precedence: `and` > `or`; parens override. Values bind via drizzle `${value}` interpolation — no string concatenation, no SQL injection. Unknown columns / operators throw `WhereParseError`. `issue_type` compiles to an `EXISTS` subquery against the `issues` table.

When adding a queue, follow the file-per-queue convention in `src/store/queues/<name>.ts` and register it in `registry.ts`. Always read `effective_reviews`, never raw `reviews`, for current-state predicates (ADR 0007).

**Stats screen** (PRD §10.8) opens from review via `t` and from any scope via `:stats`. Every aggregation row drills into a queue form — the screen is a navigable surface, not a dashboard. Aggregations live in `src/store/stats.ts` and read `effective_reviews` (ADR 0007); `drillToQueue(row)` maps each `StatRow` kind to a parseable queue id (`by-correction:`, `by-source:`, `by-reason:`, `by-issue:`, `where:`).

**Palette is the primary user-facing surface for queue switching.** `:` opens the command palette (`src/actions/palette/open.ts`), and `palette.queue` / `palette.by-source` / `palette.where` etc. (in `src/actions/palette/queue.ts`) accept a free-form argument and feed it through `resolveQueue` via `switchQueue`. The per-queue commands in `src/actions/queue/switch.ts` (`queue.switch.pending`, …) stay in the registry for direct dispatch by name (cli boot, tests) but no longer carry a `palette` field, so the palette overlay surfaces a single parametric path per family rather than one entry per concrete id.

## Conventions

- **Domain language is law.** "Annotation" means human label; "Prediction" means machine label. Don't say "label" alone unless you mean the value (`food`, `SECTION_HEADER`).
- **Skipped is its own state, not a flavor of pending.** ADR 0003.
- **Source data is immutable.** Never write back to the user's JSONL. State lives in `.labellens/state.db`.
- **Source-of-truth = `human+assistant`** whenever the assistant panel was viewed for a record, not only when accepted. ADR 0004.
- **"Current" Review state always reads from `effective_reviews`.** Never re-derive the "non-undone, non-compensated" predicate inline. ADR 0007. Audit-log queries (history strip, **review-log export**) intentionally read raw `reviews`. Exports that need per-record current state should use `latestEffectiveByRecord` (one bulk query) over per-row `currentReview` calls — see `src/export/jsonl.ts` and PRD §16.1.
- **Modal sub-surfaces go through the Overlay seam.** Picker, Note, and the slice-11 Assistant share `src/overlay/`: a pure reducer per overlay + an `applyEffects` interpreter against AppContext. Don't add bespoke key handlers in screens.
- **No native modules besides `bun:sqlite`.** Pure-TS deps only — keeps the compiled binary clean.
- **Heavy CPU work runs in a Bun `Worker`.** Hashing, signal computation, embeddings. Main thread stays responsive.
- **Streaming JSONL ingest.** Never load the full file into memory.

## Local dev loop

```sh
bun run dev:up        # init /tmp/llens-dev if needed, then launch TUI
bun run dev:down      # remove /tmp/llens-dev entirely
bun run dev:status    # show what's in /tmp/llens-dev
```

`dev:up` is idempotent — preserves existing reviews if you launch again. Knobs:

```sh
bun run dev:up -- --reset                    # wipe + reseed before launching
bun run dev:up -- --count 1000 --seed 42     # bigger / different dataset (only on first init or --reset)
bun run dev:up -- --with-marks 5             # pre-tag N records as marked (default 5)
bun run dev:up -- --with-reviews 8           # pre-insert N reviews — half accepted, half relabeled (default 8)
bun run dev:up -- --with-duplicates 3        # inject an exact-duplicate cluster of N records (default 3, 0 disables; needs --count >= 50)
bun run dev:up -- --no-prefill               # skip the marks + reviews prefill entirely
LL_DEV_DIR=/tmp/foo bun run dev:up           # alternate dir
```

Prefill seeds non-empty `marked`, `by-correction:*`, and `by-source:*` queues so a fresh dev launch exercises every queue without typing.

Signals (`flagged`, `by-issue:low_confidence`, `by-issue:source_disagreement`, `by-issue:exact_duplicate`) are computed synchronously after ingest in `src/cli/run.ts` (and in `seed-dev`). The TUI does not launch until the signals pass completes; budget is <30s for 10K records (PRD §16.1, issue #10). The Bun Worker shell in `src/signals/worker.ts` exists for future re-ingest paths where the TUI is already mounted.

Underlying primitive is `bun run seed` (wipes + generates without launching the TUI). Use that when you want to regenerate data without entering the TUI.

Record generation (vendor templates + mulberry32 PRNG) lives in `scripts/fixtures/generator.ts` and is shared between `seed-dev` (dev playground) and `scripts/gen-fixtures.ts` (committed `test/fixtures/{small,medium,large,boundary}.jsonl`). Both paths use the same deterministic source so dev data and test fixtures stay aligned. To regenerate the committed fixtures: `bun scripts/gen-fixtures.ts --all`.

To exercise the compiled binary path (parser.worker bundling, real install layout) instead of source:

```sh
bun run build:bin
/Users/somu/Code/label-lens/dist/label-lens-darwin-arm64/labellens   # from a seeded dir
```

To browse the local DB visually (drizzle-studio):

```sh
LL_DEV_DIR=/tmp/llens-dev bun run db:studio
# UI at https://local.drizzle.studio (proxies to your localhost:4983)
```

drizzle-kit studio uses `@libsql/client` (dev dep) — runtime still uses `bun:sqlite`. They share the same on-disk file. drizzle-kit cannot use bun:sqlite directly as of 2026 (drizzle-team/drizzle-orm#1520, #4350); libsql is the working escape hatch.

## Testing

See **`test/AGENTS.md`** for the full guide (tmp-store helper, snapshot conventions, screen e2e harness, what NOT to mock).

Quick reference:
- **Keymap engine** — pure unit tests. String-in, action-out.
- **Storage** — `using store = await openTmpStore({ ingest: "tiny.jsonl" })` (`test/util/tmp.ts`). Real `bun:sqlite`, never mocked. Auto-cleanup via TC39 `using`.
- **Dispatch** — build a `Command` registry, dispatch against `createAppContext`. Errors flash to `ctx.flash`; assert against that, not try/catch.
- **Screens (e2e)** — `createTestRenderer` + `mockInput.pressKey` + `captureCharFrame`. Pair `toMatchSnapshot()` (full layout regression) with `toContain(...)` (key invariants). Update intentionally with `bun test --update-snapshots`.
- **Quit injection** — screens accept `onQuit` callback so tests don't `process.exit`.
- **Performance** — shared fixtures (#14), envelope harness (#15), >20% regression fails CI.
- **SSH path** — manually verify rendering over real SSH before declaring a slice done; the test renderer doesn't simulate transport loss.

## Worktrees (paseo)

`paseo.json` configures auto-setup for worktrees of this repo (`bun install --frozen-lockfile` + `bunx lefthook install`). Use a paseo worktree when:

- **Parallel slices are in flight** — multiple branches need their own checkouts so reviews / tests don't trip over each other.
- **Risky refactor or experiment** — keep `main`'s working tree clean so a quick context-switch doesn't lose state.
- **Comparing two implementations** — branch off twice from the same base, run both side-by-side.
- **Long-running agent work** — hand off the worktree path to a Codex / Claude agent so its edits don't collide with interactive work.

Skip worktrees for trivial single-branch fixes — the regular feature-branch flow is lighter.

**How to spin one up:**

```sh
# from a real terminal (Claude's Bash tool can crash paseo's electron helper)
paseo worktree create --mode branch-off --new-branch <type>/<slug> --base main
# returns { worktreePath } — cd in, work, commit, push, open PR
```

Branch naming matches the PR convention: `<type>/<slug>`. paseo reads `paseo.json` from the **base branch's committed copy**, so any setup changes must land on `main` first.

**When done:**

```sh
paseo worktree archive <worktree-name>   # removes worktree + branch
```

If the CLI crashes from a non-tty environment (Claude's Bash tool), fall back to `git worktree remove <path> --force && git branch -D <name>`.

**Available scripts inside any worktree** (defined in `paseo.json`): `test`, `typecheck`, `lint`, `check` (full pre-merge gate), `build`. Same names usable from the paseo UI / CLI.

## Commits and PRs

- **Always work on a feature branch and open a PR — never push directly to `main`.** Branch naming: `<type>/<slug>` (e.g. `feat/walking-skeleton`, `chore/ci-setup`).
- **Do not merge PRs yourself.** Wait for human review.
- Reference the issue you're closing in the PR title or body (`closes #N`).
- Commits use conventional format. `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- **Never add Claude / agent attribution to commits or PRs.** No `Co-Authored-By: Claude` trailers, no "🤖 Generated with Claude Code" footers, no agent-self-referential lines anywhere. The author is the human running the tool.
- Don't add backwards-compat shims, dead-code comments, or feature flags. Just change the code.
- Default to no comments. If WHY is non-obvious, one short line.
