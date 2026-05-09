# LabelLens — agent orientation

You are working on **LabelLens**, a terminal-first review tool for noisy text training data. Read in this order:

1. **`PRD.md`** — full product spec (v2.7). Authoritative for behavior.
2. **`CONTEXT.md`** — domain glossary. Use these terms in code, comments, commit messages, and PR descriptions. Avoid the alternatives listed under each `_Avoid_` line.
3. **`docs/adr/`** — load-bearing decisions. ADRs 0001–0006 settle identity, re-ingest, skipped state, assistant audit, drizzle storage, and no-darwin-x64-prebuilt. Don't relitigate unless you're explicitly superseding one.

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

## Conventions

- **Domain language is law.** "Annotation" means human label; "Prediction" means machine label. Don't say "label" alone unless you mean the value (`food`, `SECTION_HEADER`).
- **Skipped is its own state, not a flavor of pending.** ADR 0003.
- **Source data is immutable.** Never write back to the user's JSONL. State lives in `.labellens/state.db`.
- **Source-of-truth = `human+assistant`** whenever the assistant panel was viewed for a record, not only when accepted. ADR 0004.
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
LL_DEV_DIR=/tmp/foo bun run dev:up           # alternate dir
```

Underlying primitive is `bun run seed` (wipes + generates without launching the TUI). Use that when you want to regenerate data without entering the TUI.

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
