# LabelLens

Terminal-first review tool for cleaning noisy text training datasets produced by rules, LLMs, weak supervision, or early model predictions. Local-first; runs over SSH; ships as a single Bun-compiled binary.

> **Status:** under active development. See [PRD.md](./PRD.md) and [docs/adr/](./docs/adr/) for design.

## Install

**curl-installer (macOS, Linux):**

```sh
curl -fsSL https://raw.githubusercontent.com/somus/label-lens/main/install.sh | sh
```

**npm:**

```sh
npm install -g label-lens
# or
bun install -g label-lens
```

## Quickstart

```sh
labellens init data.jsonl   # infer schema, write labellens.config.json
labellens                   # open the review screen
```

Press `a` to accept the prediction, `j` / `k` to navigate, `q` to quit. The reviewed records persist in `.labellens/state.db` next to the dataset.

## Project layout

- `PRD.md` — product spec.
- `CONTEXT.md` — domain glossary.
- `docs/adr/` — architecture decision records.
- `CLAUDE.md` — orientation for AI agents working on this repo.

## License

MIT
