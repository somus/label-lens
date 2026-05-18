# LabelLens

Terminal-first review tool for cleaning noisy text training datasets produced by rules, LLMs, weak supervision, or early model predictions. Local-first; runs over SSH; ships as a single Bun-compiled binary.

> **Status:** v0.1 release candidate. See [PRD.md](./PRD.md) and [docs/adr/](./docs/adr/) for design.

## Install

**curl (macOS arm64/x64, Linux arm64/x64):**

```sh
curl -fsSL https://raw.githubusercontent.com/somus/label-lens/main/install.sh | sh
```

Pin a version with `LL_VERSION=v0.1.2`, override paths with `LL_PREFIX` / `LL_BIN_DIR`. Each release ships `SHA256SUMS.txt`; the installer verifies before extracting.

**npm fallback** (containers, non-shell environments):

```sh
npm install -g label-lens
```

## 60-second quickstart

```sh
labellens init data.jsonl   # infer schema, write labellens.config.json
labellens                   # open the review screen
```

In the TUI:

- `a` accept · `r` relabel · `1`–`9` quick-relabel · `x` reject · `s` skip
- `j` / `k` navigate · `[` / `]` cycle queues
- `i` LLM assistant (configures on first press) · `t` stats · `?` help · `q` quit

When done:

```sh
labellens export jsonl       # write reviewed dataset
labellens export stats       # Markdown summary
```

## Docs

| | |
|---|---|
| **[Tutorial](./docs/tutorial.md)** | Full 5-minute walkthrough. |
| **[How-to guides](./docs/how-to/)** | Configure the assistant, work with queues, bulk-relabel, export, migrate labels, run over SSH, use Ollama locally. |
| **[Reference](./docs/reference/)** | Config schema, keybindings, queue grammar, CLI flags, output formats. |
| **[Explanation](./docs/explanation/)** | Domain model, why skipped is its own state, audit semantics. |
| **[`labellens guide`](./src/cli/guide.ts)** | Print the tutorial offline (SSH-friendly). |
| **`labellens --help`** | Quick reference printed to stdout. |
| **`man labellens`** | Man page (installed by curl-installer). |

## Project layout

- `PRD.md` — product spec.
- `CONTEXT.md` — domain glossary.
- `docs/` — user-facing documentation ([index](./docs/index.md)).
- `docs/adr/` — architecture decision records.
- `AGENTS.md` (alias `CLAUDE.md`) — orientation for AI agents working on this repo.

## License

MIT
