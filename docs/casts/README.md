# Screencasts (vhs tapes)

LabelLens uses [charmbracelet/vhs](https://github.com/charmbracelet/vhs) to record terminal sessions deterministically. Tapes live in `tapes/`, generated media land in `../media/` (committed) via the scratch dir `out/` (gitignored).

## Prerequisites

```sh
brew install vhs
```

vhs pulls in `ttyd` and `ffmpeg`. The repo also needs `bun` on `PATH` (the tapes alias `labellens` to `bun run src/main.ts`).

## Regenerate all tapes

From the repo root:

```sh
bun run scripts/record-casts.ts
```

Each tape produces `<name>.gif` + `<name>.webm` in `out/`; the script copies them into `../media/`. Pre-existing files are overwritten in place.

## Regenerate a single tape

```sh
bun run scripts/record-casts.ts hero
```

Or call vhs directly (output stays in `out/`, no publish step):

```sh
vhs docs/casts/tapes/hero.tape
```

## Editing tapes

Each tape includes a `Hide` block at the top that:

1. Sets deterministic terminal capability env vars and a clean `PS1`.
2. Builds a fresh sandbox under `sandbox/<name>/`.
3. Copies the relevant files out of `fixture/`.
4. Aliases `labellens` to `bun run $REPO/src/main.ts`.

After `Show`, the visible portion of the recording begins. Sleep durations are tuned for clarity — bump them if a future change makes the TUI take longer to settle.

## Assistant tapes (mocked provider)

Assistant-focused tapes rely on the env-gated mock seam in `src/assistant/mock-bootstrap.ts`. Setting `LABELLENS_ASSISTANT_MOCK_FILE` to a JSON file replaces the real `queryAssistant` call with a canned response, so recordings stay offline and deterministic. The seam is dev-only — it is *not* invoked in the compiled release binary unless the env var is set.

## When to re-record

Before tagging a release. The PR template includes a checkbox; verify visually before merging by playing each `.webm` locally.
