# assistant.tape — inline assistant footer demo with mocked response.
# Run from repo root:
#   vhs docs/casts/tapes/assistant.tape

Output docs/casts/out/assistant.gif
Output docs/casts/out/assistant.webm

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
Type "rm -rf docs/casts/sandbox/assistant && mkdir -p docs/casts/sandbox/assistant" Enter
Type "cp docs/casts/fixture/transactions.assistant.jsonl docs/casts/sandbox/assistant/transactions.jsonl" Enter
Type "cp docs/casts/fixture/labellens.config.assistant.json docs/casts/sandbox/assistant/labellens.config.json" Enter
Type "cd docs/casts/sandbox/assistant" Enter
Type "export LABELLENS_ASSISTANT_MOCK_FILE=$REPO/docs/casts/fixture/assistant-mock.json" Enter
Type "alias labellens='bun run $REPO/src/main.ts'" Enter
Type "clear" Enter
Show

Type "labellens"
Sleep 300ms
Enter
Sleep 2500ms

# First-launch queue picker — accept default 'Pending'.
Enter
Sleep 1800ms

# Open assistant footer.
Type "i"
Sleep 4200ms

# Expand the reasoning so the recommendation is visible before committing.
Tab
Sleep 3600ms

# Commit the assistant's relabel recommendation.
Enter
Sleep 2200ms

# Quit.
Type "q"
Sleep 1500ms
