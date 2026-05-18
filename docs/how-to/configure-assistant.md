# How-to: configure the LLM assistant

The assistant is off by default. Three paths to turn it on.

## Option A — wizard (recommended for first-time setup)

1. Launch `labellens`.
2. Focus any record.
3. Press `i`.
4. The configure overlay opens — `[1] Anthropic` … `[5] Ollama`. Pick by digit, press `Enter`.
5. Paste your API key (or enter Ollama URL).
6. For remote providers: read the privacy notice, press `y` to confirm.

The wizard writes the choice to `labellens.config.json` and exports your typed key into the active session's env. To survive a relaunch, add the same export to your shell rc:

```sh
# ~/.zshrc or ~/.bashrc
export ANTHROPIC_API_KEY="sk-ant-…"
```

The provider's canonical env var name appears in the configure overlay's auth step. Match it.

## Option B — config + env var

Skip the wizard entirely by populating `labellens.config.json`:

```jsonc
"assistant": {
  "enabled": true,
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "apiKeyEnvVar": "ANTHROPIC_API_KEY",
  "privacyAcknowledged": true
}
```

Then export the key in your shell:

```sh
export ANTHROPIC_API_KEY="sk-ant-…"
labellens
```

`privacyAcknowledged: true` skips the privacy gate. Only set this when you understand what the assistant sends — see [the privacy notice](#privacy-what-gets-sent).

## Option C — local-only (Ollama)

No data leaves the machine. No API key.

1. Install Ollama: `curl -fsSL https://ollama.com/install.sh | sh`
2. Pull a model: `ollama pull llama3.1`
3. Configure LabelLens:

```jsonc
"assistant": {
  "enabled": true,
  "provider": "ollama",
  "model": "llama3.1",
  "ollamaUrl": "http://localhost:11434/v1"
}
```

4. Launch with `--local-only` to belt-and-braces the privacy guarantee:

```sh
labellens --local-only
```

`--local-only` aborts at startup if the configured provider isn't Ollama.

## Switching providers later

Edit `labellens.config.json` directly. The next `i` press picks up the change. Cached responses are keyed by `(record_id, prompt_hash)` where prompt_hash includes provider + model + prompt template version — so switching invalidates stale cache rows automatically.

## Using the footer

After configuring:

- `i` — open assistant for the focused record.
- Footer shows `LLM thinking…` while streaming.
- On done: `LLM: <action> → <label> (<confidence>)`.
- `Tab` — expand reasoning above the footer.
- `Enter` — commit the suggested action. Tagged `human+assistant` per ADR 0004.
- `Esc` — dismiss. Still tagged `human+assistant` if any subsequent decision lands for this record in the same focus session (audit semantics — viewing counts).

Navigation (`j`/`k`/`[`/`]`) clears the per-record "viewed" set so the next record starts fresh.

## Privacy: what gets sent

Each `i` query sends only:

- The current record's `text`.
- `context_before` / `context_after`.
- The label set + any `definition` strings + per-label `key` hints.
- The `predictions[]` array for this record.
- The `guidelines` content.

It does **not** send other records, review history, the audit log, or anything from `.labellens/state.db`.

Cached locally by `(record_id, prompt_hash)` — re-asking on the same record is free.

With `--local-only` or an Ollama provider, no data leaves the machine.

The full notice (lifted from PRD §10.5) is shown on the privacy step of the wizard and stored as `ASSISTANT_PRIVACY_NOTICE` in `src/assistant/privacy_notice.ts`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `No API key found. Export one of: X or Y` | Env var unset (or named differently than expected) | Export the var the error names. The installer reads `apiKeyEnvVar` first, then falls back to pi-ai's canonical name (`GEMINI_API_KEY` for Google etc). |
| `403 method doesn't allow unregistered callers` (Google) | API key wasn't passed to pi-ai | Update to ≥ the commit that added explicit apiKey threading. Earlier versions relied on pi-ai's env lookup which expected `GEMINI_API_KEY`. |
| `Privacy notice not acknowledged` | First remote call, `privacyAcknowledged: false` in config | Run the wizard once (`i` → confirm) or set `privacyAcknowledged: true` manually. |
| Assistant returns label not in `config.labels` | Older build without the StringEnum constraint | Update. New builds constrain `suggestedLabel` at the API level so the model can't return a label outside your set. |
| Configure overlay swallows pasted text | Bracketed-paste not handled | Update. `paste` event handler ships from issue #63 era. |
