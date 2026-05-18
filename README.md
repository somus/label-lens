# LabelLens

Terminal-first review tool for cleaning noisy text training datasets produced by rules, LLMs, weak supervision, or early model predictions. Local-first; runs over SSH; ships as a single Bun-compiled binary.

> **Status:** under active development. See [PRD.md](./PRD.md) and [docs/adr/](./docs/adr/) for design.

## Install

**curl (macOS arm64, Linux arm64/x64):**

```sh
curl -fsSL https://raw.githubusercontent.com/somus/label-lens/main/install.sh | sh
```

Pin a specific release:

```sh
curl -fsSL https://raw.githubusercontent.com/somus/label-lens/main/install.sh | LL_VERSION=v0.1.2 sh
```

By default the installer drops the binary in `~/.local/share/label-lens/` and symlinks `~/.local/bin/labellens`. Override via `LL_PREFIX` and `LL_BIN_DIR`.

**Integrity verification.** Each release ships `SHA256SUMS.txt` alongside the tarballs. The installer downloads the manifest before extracting:

- Manifest missing (404) → warn + continue. Backward-compat for pre-`v0.0.3` releases that didn't ship checksums.
- Manifest empty (network truncation, broken proxy) → warn + continue. Rare; manual verification recommended.
- Manifest present but missing your target → **fatal**. Release was published incomplete or tampered with; the installer refuses to extract.
- Hash mismatch → fatal.

**npm fallback** (Intel Mac / containers / non-shell environments):

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
