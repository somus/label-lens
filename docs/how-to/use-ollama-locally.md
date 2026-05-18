# How-to: run the LLM assistant against a local Ollama

Best path for sensitive datasets. No data leaves the machine.

<a href="../media/local-only-ollama.webm">
  <img src="../media/local-only-ollama.gif" alt="Launching LabelLens with an Ollama assistant config and local-only mode" width="800">
</a>

## Setup

1. **Install Ollama:**

   ```sh
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **Pull a model.** Smaller is fine for label suggestions; the prompt + record context is short.

   ```sh
   ollama pull llama3.1            # 4.7GB, fast
   # or
   ollama pull qwen2.5:14b         # 8GB, better quality
   ```

3. **Start the server** (Ollama auto-starts on most installs; double-check):

   ```sh
   ollama serve &
   curl -sS http://localhost:11434/v1/models   # should list pulled models
   ```

4. **Configure LabelLens.** Either via the wizard (`i` → pick `[5] Ollama` → enter URL) or directly in `labellens.config.json`:

   ```jsonc
   "assistant": {
     "enabled": true,
     "provider": "ollama",
     "model": "llama3.1",
     "ollamaUrl": "http://localhost:11434/v1"
   }
   ```

5. **Launch with `--local-only`:**

   ```sh
   labellens --local-only
   ```

   The flag aborts launch if any remote provider sneaks into the config. Belt-and-braces for the privacy guarantee.

## Using

Press `i` like any other provider. Footer streams reasoning + suggestion. Latency depends on model size — `llama3.1` typically settles in 2-5 seconds on Apple Silicon; bigger models take longer.

## Custom Ollama host

If Ollama runs on a separate box (you SSH into the labelling host, Ollama runs on a GPU host on the same LAN):

```jsonc
"assistant": {
  "enabled": true,
  "provider": "ollama",
  "model": "llama3.1",
  "ollamaUrl": "http://gpu-host.local:11434/v1"
}
```

LabelLens treats `provider: "ollama"` as local regardless of where Ollama actually runs. `--local-only` permits this — but **only because the connection is to the configured `ollamaUrl`**. If the host is across the internet you're crossing a network boundary; the local-only label refers to "not an LLM SaaS", not "no network traffic".

## Verifying no remote traffic

```sh
# Block all outgoing connections except localhost (macOS):
sudo pfctl -e
# Set up a rule, run labellens, watch logs
```

Or simply check Ollama logs (`~/.ollama/logs/server.log`) while you use `i` — every query should show up there.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Connection refused | Ollama not running | `ollama serve &` |
| Model not found | Model not pulled locally | `ollama pull <model>` |
| Tool calls return empty / malformed | Smaller models struggle with structured output | Try a larger model (`qwen2.5:14b`, `gpt-oss:20b`) or accept that some records get the `no-tool-call` error and need manual labeling |
| Very slow | CPU-only inference on a large model | Either a smaller model or a GPU host (see "Custom Ollama host" above) |
