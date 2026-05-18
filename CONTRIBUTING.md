# Contributing to LabelLens

This file is the long-form how-to for working on the codebase. The orientation map for AI agents + humans is [`AGENTS.md`](./AGENTS.md); start there.

## Local dev loop

```sh
bun run dev:up        # init /tmp/llens-dev if needed, then launch the TUI
bun run dev:down      # remove /tmp/llens-dev entirely
bun run dev:status    # show what's in /tmp/llens-dev
```

`dev:up` is idempotent — preserves existing reviews on relaunch.

### Useful flags

```sh
bun run dev:up -- --reset                                # wipe + reseed before launching
bun run dev:up -- --count 1000 --seed 42                 # bigger / different dataset (first init or --reset only)
bun run dev:up -- --with-marks 5                         # pre-tag N records as marked (default 5)
bun run dev:up -- --with-reviews 8                       # pre-insert N reviews — half accepted, half relabeled
bun run dev:up -- --with-notes 4                         # attach notes to N records (exercises the prediction-block `note` row)
bun run dev:up -- --with-duplicates 3                    # inject an exact-duplicate cluster (needs --count >= 50)
bun run dev:up -- --with-many-labels                     # extend classification labels past 9 (chip rail `+N more (r)`)
bun run dev:up -- --with-boundary-multi-source --task boundary  # ~30% of boundary records get a second source (model_v1)
bun run dev:up -- --no-prefill                           # skip the marks + reviews + notes prefill entirely
LL_DEV_DIR=/tmp/foo bun run dev:up                       # alternate dir
```

Prefill seeds non-empty `marked`, `by-correction:*`, and `by-source:*` queues so a fresh dev launch exercises every queue without typing.

### Signals timing

Signals (`flagged`, `by-issue:low_confidence`, `by-issue:source_disagreement`, `by-issue:exact_duplicate`) compute synchronously after ingest in `src/cli/run.ts` (and in `seed-dev`). The TUI does not launch until the signals pass completes; budget is <30s for 10K records (PRD §16.1, issue #10). The Bun Worker shell in `src/signals/worker.ts` exists for future re-ingest paths where the TUI is already mounted.

### Re-seeding without the TUI

```sh
bun run seed      # wipes + generates fresh data; does not launch the TUI
```

### Fixture parity

Record generation (vendor templates + mulberry32 PRNG) lives in `dev/fixtures/generator.ts` and is shared between `seed-dev` (dev playground) and `dev/gen-fixtures.ts` (committed `test/fixtures/{small,medium,large,boundary}.jsonl`). Both use the same deterministic source so dev data and test fixtures stay aligned.

Regenerate committed fixtures:

```sh
bun dev/gen-fixtures.ts --all
```

### Exercise the compiled binary path

```sh
bun run build:bin
dist/label-lens-darwin-arm64/labellens   # from a seeded dir
```

Useful when you've touched anything that compiles differently in `--compile` mode (parser.worker bundling, install layout, embedded migrations).

### Browse the DB

```sh
LL_DEV_DIR=/tmp/llens-dev bun run db:studio
# UI at https://local.drizzle.studio (proxies to localhost:4983)
```

`drizzle-kit studio` uses `@libsql/client` (dev dep) — runtime still uses `bun:sqlite`. They share the same on-disk file. drizzle-kit cannot use `bun:sqlite` directly as of 2026 (drizzle-team/drizzle-orm#1520, #4350); libsql is the working escape hatch.

## Testing

See [`test/AGENTS.md`](./test/AGENTS.md) for the full guide (tmp-store helper, snapshot conventions, screen e2e harness, what NOT to mock).

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

### Spinning one up

```sh
# from a real terminal (Claude's Bash tool can crash paseo's electron helper)
paseo worktree create --mode branch-off --new-branch <type>/<slug> --base main
# returns { worktreePath } — cd in, work, commit, push, open PR
```

paseo reads `paseo.json` from the **base branch's committed copy**, so any setup changes must land on `main` first.

### When done

```sh
paseo worktree archive <worktree-name>   # removes worktree + branch
```

If the CLI crashes from a non-tty environment, fall back to `git worktree remove <path> --force && git branch -D <name>`.

### Scripts available inside any worktree

Defined in `paseo.json`: `test`, `typecheck`, `lint`, `check` (full pre-merge gate), `build`. Same names usable from the paseo UI / CLI.

## Commits and PRs

- **Always work on a feature branch and open a PR — never push directly to `main`.** Branch naming: `<type>/<slug>` (e.g. `feat/walking-skeleton`, `chore/ci-setup`).
- **Do not merge PRs yourself.** Wait for human review.
- Reference the issue you're closing in the PR title or body (`closes #N`).
- Commits use conventional format. `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- **Never add Claude / agent attribution to commits or PRs.** No `Co-Authored-By: Claude` trailers, no "🤖 Generated with Claude Code" footers, no agent-self-referential lines anywhere. The author is the human running the tool.
- Don't add backwards-compat shims, dead-code comments, or feature flags. Just change the code.
- Default to no comments. If WHY is non-obvious, one short line.

## Pre-commit gate

```sh
bun run typecheck && bunx biome check && bun test
```

Lefthook runs this on every commit. Don't bypass with `--no-verify`.

## Issue tracker

GitHub Issues on this repo. Two triage labels:

- `ready-for-afk` — pick up and ship without a human gate.
- `hitl` — needs human verification step (auth UX, distribution smoke matrix).

Slices are tracer bullets — each cuts end-to-end through schema, store, render, action. Don't refactor for hypothetical future slices. Three similar lines beats a premature abstraction.
