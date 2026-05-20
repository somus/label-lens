# queue-skipped.tape — queue switching plus skipped-vs-pending state.
# Run from repo root:
#   vhs docs/casts/tapes/queue-skipped.tape

Output docs/casts/out/queue-skipped.gif
Output docs/casts/out/queue-skipped.webm

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
Type "rm -rf docs/casts/sandbox/queue-skipped && mkdir -p docs/casts/sandbox/queue-skipped" Enter
Type "cp docs/casts/fixture/transactions.jsonl docs/casts/sandbox/queue-skipped/" Enter
Type "cp docs/casts/fixture/labellens.config.json docs/casts/sandbox/queue-skipped/" Enter
Type "cd docs/casts/sandbox/queue-skipped" Enter
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

# Skip the focused record; it leaves pending and increments the skipped counter.
Type "s"
Sleep 1800ms

# Move explicitly into the skipped queue.
Right
Sleep 1800ms

# Return to pending, then open the queue overlay with live counts.
Left
Sleep 1500ms
Type "Q"
Sleep 1800ms

# Move through queues at an observable pace, then pick low-confidence.
Down
Sleep 900ms
Down
Sleep 900ms
Down
Sleep 900ms
Enter
Sleep 1800ms

# Quit.
Type "q"
Sleep 1500ms
