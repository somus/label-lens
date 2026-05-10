# labellens-tutorial(1)

LabelLens walks you through reviewing predicted labels on noisy text data.
After ingesting a JSONL file, the review screen presents one record at a time.

## First steps

- Press `?` for the contextual help overlay.
- Press `:` to open the command palette.
- Press `g g` to read the project guidelines.

## Reviewing a record

- `a` — accept the prediction
- `r` — relabel via picker (or press `1`–`9` for direct labels)
- `x` — reject
- `s` — skip; record stays in the queue but moves out of `pending`
- `n` — attach a note
- `m` — mark this record so you can revisit it from `:queue marked`
- `u` — undo the last decision

## Switching queues

- `[` / `]` cycle through built-in queues.
- `:queue <name>` jumps directly: `:queue low-confidence`, `:queue marked`, etc.
- `:by-source llm:gpt-4` filters to one prediction source.

See `:help keymap` for the full key map and `:help config` for configuration.
