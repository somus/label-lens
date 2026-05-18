# Reference: CLI

```
labellens [SUBCOMMAND] [ARGS] [FLAGS]
```

No subcommand = open the review screen against the config in the current directory.

## Subcommands

### `labellens` (no subcommand)

Open the review screen. Requires `labellens.config.json` in the current directory. Without one, prompts to run `labellens init`.

```sh
labellens                  # open review
labellens --local-only     # refuse remote LLM providers regardless of config
```

### `labellens init <file.jsonl>`

Bootstrap a new project. Infers the field map from the JSONL by sampling the first records (see `src/config/inference.ts`), writes `labellens.config.json` next to the file, and exits.

```sh
labellens init transactions.jsonl
```

After running, edit `labellens.config.json` to tune the `labels` array and optional `guidelines`.

### `labellens export [format] [flags]`

Export reviewed data.

```sh
labellens export jsonl                    # write to output.path from config
labellens export csv
labellens export stats                    # Markdown summary
labellens export log                      # full audit trail (every review row, including undone)
labellens export jsonl --output custom.jsonl # override output base/path
```

| Format | What it writes |
|---|---|
| `jsonl` | One row per reviewed record. Reads `effective_reviews` → only the current state lands. |
| `csv` | Same shape, CSV-encoded. |
| `stats` | Markdown report: totals, by-source breakdown, top corrections, imported issue counts. |
| `log` | Full review history (audit trail). Reads raw `reviews` table; includes undone + compensating rows. |

Default format when omitted: `output.format` from config (`jsonl`).

### `labellens migrate --rename <old>:<new>`

Rename a label across the entire DB. Use when you change a label string in `config.labels` after reviewing — without migration, the existing reviews would be tagged with an unknown value and ingest would refuse to load.

```sh
labellens migrate --rename food:meal
labellens migrate --rename policy:spam:ham    # last colon splits — from='policy:spam', to='ham'
```

Always creates a backup at `.labellens/.bak` before mutating.

### `labellens --version` / `labellens -v`

Print the version (release tag baked at compile time, `dev` for source builds).

## Global flags

| Flag | Default | Meaning |
|---|---|---|
| `--local-only` | off | Refuse any remote LLM provider. The assistant must be configured for Ollama or disabled entirely; otherwise launch aborts with an error. |

## Environment variables

| Variable | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Read by the assistant when `provider: "anthropic"`. |
| `OPENAI_API_KEY` | Same for `openai`. |
| `GEMINI_API_KEY` | Same for `google` (matches pi-ai's canonical name). |
| `GROQ_API_KEY` | Same for `groq`. |
| `<CUSTOM>` | Whatever `config.assistant.apiKeyEnvVar` names. |
| `COLORTERM` / `TERM` | Read by capability detection. Force `truecolor` / `256-color` modes. |
| `NO_COLOR` | When set (any non-empty value), forces mono palette. |
| `LABELLENS_EXIT_DELAY_MS` | Override post-quit terminal-drain delay (default 30ms). Useful on slow SSH. |
| `LL_VERSION` | Read by `install.sh` to pin a specific release. |
| `LL_PREFIX` | Read by `install.sh` for non-default install dir. |
| `LL_BIN_DIR` | Read by `install.sh` for non-default symlink dir. |

## Exit codes

| Code | Reason |
|---|---|
| `0` | Success / clean shutdown. |
| `1` | Generic runtime error (uncaught exception). |
| `2` | User-visible config or invocation error: missing config, invalid `config.labels[].key`, `--local-only` vs remote provider mismatch, unknown labels in DB, unknown subcommand. |

## State layout

| Path | Contents |
|---|---|
| `./labellens.config.json` | Project config. Edit to tune labels, guidelines, display. |
| `./.labellens/state.db` | SQLite database (records, predictions, reviews, issues, assistant_queries, tags, fingerprints). |
| `./.labellens/.bak` | Pre-migration backup written by `labellens migrate`. |

The source JSONL is never modified.

## Re-ingest behaviour

On launch LabelLens compares the JSONL's `(mtime, content_sha256)` fingerprint to the stored one. On change:

- Strictly additive (only new records appended) → silent ingest.
- Predictions changed for existing records → predictions-only re-ingest, reviews preserved (ADR 0002).
- Text or context changed → soft-delete the orphaned record into the `orphans` queue, ingest the new one. Original review stays linked to the orphan for audit.
- Reviewer prompted to choose **fresh re-ingest** (wipe + back up) or **merge** at first launch after a change. MVP supports fresh + the additive auto-paths; full merge is V1.
