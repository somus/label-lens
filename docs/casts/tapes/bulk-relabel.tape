# bulk-relabel.tape — narrow to a label queue and relabel each candidate.
# Run from repo root:
#   vhs docs/casts/tapes/bulk-relabel.tape

Output docs/casts/out/bulk-relabel.gif
Output docs/casts/out/bulk-relabel.webm

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
Type "rm -rf docs/casts/sandbox/bulk-relabel && mkdir -p docs/casts/sandbox/bulk-relabel" Enter
Type "cp docs/casts/fixture/transactions.jsonl docs/casts/sandbox/bulk-relabel/" Enter
Type "cp docs/casts/fixture/labellens.config.json docs/casts/sandbox/bulk-relabel/" Enter
Type "cd docs/casts/sandbox/bulk-relabel" Enter
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

# Narrow to all current shopping records.
Type ":"
Sleep 800ms
Type "by-label shopping"
Sleep 1000ms
Enter
Sleep 1800ms

# Commit utility for each candidate; each row exits the by-label queue.
Type "4"
Sleep 2000ms
Type "4"
Sleep 2600ms

# Quit.
Type "q"
Sleep 1500ms
