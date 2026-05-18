# local-only-ollama.tape — launch the assistant with an Ollama config and --local-only.
# Run from repo root:
#   vhs docs/casts/tapes/local-only-ollama.tape

Output docs/casts/out/local-only-ollama.gif
Output docs/casts/out/local-only-ollama.webm

Require bun

Set Shell "bash"
Set FontSize 14
Set Width 1600
Set Height 900
Set Theme "Dracula"
Set TypingSpeed 40ms

Env COLORTERM truecolor
Env TERM xterm-256color
Env TERM_PROGRAM iTerm.app
Env NO_COLOR ""

Hide
Type "export PS1='$ '" Enter
Type "REPO=$PWD" Enter
Type "rm -rf docs/casts/sandbox/local-only-ollama && mkdir -p docs/casts/sandbox/local-only-ollama" Enter
Type "cp docs/casts/fixture/transactions.assistant.jsonl docs/casts/sandbox/local-only-ollama/transactions.jsonl" Enter
Type "cp docs/casts/fixture/labellens.config.assistant.json docs/casts/sandbox/local-only-ollama/labellens.config.json" Enter
Type "cd docs/casts/sandbox/local-only-ollama" Enter
Type "export LABELLENS_ASSISTANT_MOCK_FILE=$REPO/docs/casts/fixture/assistant-mock.json" Enter
Type "alias labellens='bun run $REPO/src/main.ts'" Enter
Type "clear" Enter
Show

Type "sed -n '/assistant/,/}/p' labellens.config.json"
Sleep 600ms
Enter
Sleep 1800ms

Type "labellens --local-only"
Sleep 300ms
Enter
Sleep 2500ms

# First-launch queue picker — accept default 'Pending'.
Enter
Sleep 1800ms

# Ask the assistant. The recording uses the docs mock seam, but the visible
# launch path still exercises --local-only with provider=ollama.
Type "i"
Sleep 4200ms

# Show the reasoning before committing the local recommendation.
Tab
Sleep 3000ms
Enter
Sleep 2200ms

# Quit.
Type "q"
Sleep 1500ms
