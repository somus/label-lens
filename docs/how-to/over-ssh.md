# How-to: run LabelLens over SSH

LabelLens is built for SSH. Compiled binary, no Node runtime needed on the remote host, terminal-first UI that survives slow links.

## Install on the remote

```sh
ssh you@labeling-host
curl -fsSL https://raw.githubusercontent.com/somus/label-lens/main/install.sh | sh
```

The installer drops the binary in `~/.local/share/label-lens/` and symlinks `~/.local/bin/labellens`. If `~/.local/bin` isn't on your remote `$PATH`, the installer prints the export line to add to your shell rc.

## Terminal

Use a terminal that supports `truecolor`, bracketed paste, and OSC theme queries. Recent versions of:

- iTerm2 (macOS)
- WezTerm
- Ghostty
- Kitty
- Alacritty
- Windows Terminal
- mosh (over SSH)

Avoid: macOS Terminal.app (works but no truecolor on older builds), screen + tmux without truecolor passthrough.

`tmux` users: add `set -g default-terminal "tmux-256color"` and `set -ga terminal-overrides ",xterm-256color:RGB"` to `.tmux.conf`. Without it LabelLens will detect 256-color mode and skip banding / gradients.

## Assistant on the remote

SSH breaks the OAuth localhost-callback flow that pi-ai's subscription paths use (Claude Pro/Max, ChatGPT Plus/Pro, Copilot). MVP supports only **API key** and **Ollama** auth modes — both work over SSH.

Either:

1. Export your API key on the remote (`export ANTHROPIC_API_KEY=…` in `~/.zshrc`), or
2. Run a local Ollama on the same box. See [use-ollama-locally](./use-ollama-locally.md).

For ultra-paranoid setups: run Ollama on a GPU node in the same VPC, point the LabelLens config at it, launch with `--local-only`. No SaaS in the loop.

## Long-running sessions

Wrap LabelLens in `tmux` so dropped SSH connections don't lose your place:

```sh
ssh you@host
tmux new -s labels
labellens
# Detach: C-b d
# Reattach later:
ssh you@host
tmux attach -t labels
```

LabelLens persists everything to `.labellens/state.db` on every decision; tmux detach is graceful even mid-decision.

## Slow links

LabelLens renders deltas — a keystroke pushes ~a few hundred bytes. Even on a 100ms+ link the loop stays usable.

If renders feel laggy:

- Disable motion via `display.motion = "off"` in config. Eliminates fades / progress tweens.
- Disable banding via `display.banding = "off"`. Cuts the per-row tint that costs bytes.

## Display capability quirks

LabelLens probes the terminal via `$COLORTERM` / `$TERM` / OSC 11. SSH usually passes `$TERM` correctly. If LabelLens detects 16-color or mono mode when you expect truecolor, set:

```sh
export COLORTERM=truecolor
labellens
```

…or force via config (`display.color: "truecolor"`).

## Quitting cleanly

`q` quits. There's a brief `LABELLENS_EXIT_DELAY_MS` (default 30ms) before `process.exit` so any in-flight OSC probe responses drain before the prompt prints. Bump it on slow SSH if you see garbage bytes in your shell prompt after quitting:

```sh
LABELLENS_EXIT_DELAY_MS=200 labellens
```
