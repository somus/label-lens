# Tutorial: review your first dataset in 5 minutes

This tutorial walks you through the full LabelLens loop on a small fixture: ingest a JSONL file of LLM-tagged records, accept the good predictions, fix the bad ones, and export a clean dataset.

You'll need: `labellens` installed (see the [README](../README.md)) and a terminal.

<a href="media/init.webm">
  <img src="media/init.gif" alt="Initialise a LabelLens project" width="800">
</a>

## 1. Get some data

Save this as `transactions.jsonl`:

```jsonl
{"text": "Lunch at Zomato", "prediction": "food", "confidence": 0.92, "source": "llm:gpt-4"}
{"text": "Uber to airport", "prediction": "travel", "confidence": 0.88, "source": "llm:gpt-4"}
{"text": "Netflix monthly", "prediction": "shopping", "confidence": 0.45, "source": "llm:gpt-4"}
{"text": "Salary credit Apr", "prediction": "salary", "confidence": 0.99, "source": "llm:gpt-4"}
{"text": "Electricity bill", "prediction": "utility", "confidence": 0.81, "source": "llm:gpt-4"}
```

## 2. Initialise

```sh
labellens init transactions.jsonl
```

This infers the field map (`text`, `prediction`, `confidence`, `source`), writes `labellens.config.json`, and exits. Open the file — you'll see the configured label set under `labels`. Edit it now if `shopping`, `salary`, `utility` etc. don't cover your domain.

The generated file ships a `$schema` URL — VS Code / Cursor / Helix / JetBrains pick it up for inline autocomplete + hover docs as you edit. See [how-to: edit the config](./how-to/edit-config.md) for editor-specific setup.

## 3. Review

```sh
labellens
```

The review screen opens to the first pending record. The chip rail at the bottom shows your labels indexed `[1]` through `[N]`.

For each record, decide:

- `a` — **accept** the model's prediction.
- `x` — **reject** (predicted label is wrong, no replacement yet).
- A digit — **relabel** to that position's label. `2` flips this record to `travel`.
- `r` — open the **relabel picker** for fuzzy-search over the full label set.
- `s` — **skip** for later (gets its own queue; never re-surfaces in `pending`).
- `n` — attach a **note**.

`j` / `k` navigate without committing. `u` undoes the last decision.

Try it: walk through all five records. Accept the good ones, flip `Netflix monthly` to `utility` (digit for utility), skip the ones you're unsure about.

## 4. Inspect what you did

Press `t` for the **stats** screen. You'll see:

- **Reviewed / total** progress.
- **Corrections**: every `food → utility`-style flip aggregated. Each row drills into a queue showing the affected records.
- **By source**: how often each prediction source needed correction.
- **By reason / imported issues**: signal-quality breakdowns.

Press `q` to leave stats.

## 5. Try the queues

Press `Q` (shift+q) to open the queue picker. Browse:

- **pending** — untouched records.
- **skipped** — what you put off in step 3.
- **low-confidence** — records where the model wasn't sure (sorted ascending).
- **disagreements** — multi-source records where labels conflict.
- **flagged** — records with imported issues.
- **marked** — records you tagged with `m`.

Switch between queues with `[` / `]` while reviewing. Each cycles to a new context without losing your place — cursors are memoised per queue.

## 6. Try the LLM assistant (optional)

Press `i`. If you haven't configured an assistant yet, the configure overlay opens:

1. Pick a provider (Anthropic, OpenAI, Google, Groq, or Ollama).
2. Paste your API key (or enter the Ollama URL for local).
3. Confirm the privacy notice — only the current record + label set + guidelines gets sent.

Once configured, `i` opens the assistant footer for the focused record. The model streams reasoning + a suggested label. Press `Tab` to expand the reasoning, `Enter` to commit the suggestion (audited as `human+assistant`), or `Esc` to dismiss.

The first call hits the network; results are cached by `(record_id, prompt_hash)` so revisits are free. Add `--local-only` to the launch to disable remote providers.

## 7. Export

```sh
labellens export jsonl
labellens export csv
labellens export stats        # Markdown summary
labellens export log          # full audit trail
```

Each command writes to the path configured under `output.path` in `labellens.config.json`. The export reads `effective_reviews` (current state, not the audit log) — only your latest decision per record lands in the file.

## Next steps

- [How-to: configure the assistant in depth](./how-to/configure-assistant.md)
- [Reference: keybindings](./reference/keybindings.md) — full table of keys across all scopes.
- [Reference: config](./reference/config.md) — every field in `labellens.config.json`.
- [Reference: queues](./reference/queues.md) — built-in, parametric, and `where:` queries.
- [Explanation: prediction vs annotation](./explanation/prediction-vs-annotation.md) — the domain model in one page.
