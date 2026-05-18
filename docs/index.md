# LabelLens docs

LabelLens is a terminal-first review tool for cleaning noisy text training datasets.

Documentation is organised by [Diátaxis](https://diataxis.fr): pick a quadrant by what you need.

<a href="media/hero.webm">
  <img src="media/hero.gif" alt="LabelLens review loop" width="800">
</a>

## I want to learn

→ **[Tutorial: review your first dataset](./tutorial.md)** — 5-minute walkthrough from `init` to `export`.

## I want to solve a specific problem

| How-to | When |
|---|---|
| [Edit `labellens.config.json`](./how-to/edit-config.md) | Set up editor autocomplete + inline docs via the `$schema` field. |
| [Configure the assistant](./how-to/configure-assistant.md) | Turn on LLM suggestions; pick a provider; switch to local Ollama. |
| [Work with queues](./how-to/work-with-queues.md) | Triage by source, confidence, disagreement, custom `where:` filters. |
| [Bulk-relabel a class](./how-to/bulk-relabel.md) | Many records of one label need flipping to another. |
| [Export results](./how-to/export-results.md) | Write JSONL, CSV, Markdown stats, or the full audit log. |
| [Migrate renamed labels](./how-to/migrate-renamed-labels.md) | You changed a label name; remap stored reviews. |
| [Run over SSH](./how-to/over-ssh.md) | Long-running review on a remote box. |
| [Use Ollama locally](./how-to/use-ollama-locally.md) | Air-gapped LLM assistant. |

## I need to look something up

| Reference | What's in it |
|---|---|
| [`labellens.config.json`](./reference/config.md) | Every field in the project config. |
| [Keybindings](./reference/keybindings.md) | Every key, every scope. Press `?` in-app for the live version. |
| [Queues](./reference/queues.md) | Built-in queues, parametric factories, `where:` grammar. |
| [CLI](./reference/cli.md) | Subcommands, flags, env vars, exit codes, state layout. |
| [Output schemas](./reference/output-schema.md) | JSONL / CSV / log row shapes. |

## I want to understand the design

| Explanation | Why it matters |
|---|---|
| [Prediction vs annotation](./explanation/prediction-vs-annotation.md) | The core domain split. Read this first. |
| [Skipped is its own state](./explanation/skipped-state.md) | Why `s` doesn't just defer (ADR 0003). |
| [Effective Review](./explanation/effective-review.md) | How the audit log + current state interact (ADR 0007). |
| [Assistant audit](./explanation/assistant-audit.md) | Why viewing the assistant counts as influence (ADR 0004). |

## Internal references

Not user-facing, but listed here so you know where to look if you contribute:

- [`PRD.md`](../PRD.md) — full product spec (v2.9).
- [`CONTEXT.md`](../CONTEXT.md) — domain glossary.
- [`docs/adr/`](./adr/) — architecture decision records (ADRs 0001 – 0009).
- [`AGENTS.md`](../AGENTS.md) — orientation for AI agents working on the repo (symlinked to `CLAUDE.md`).
