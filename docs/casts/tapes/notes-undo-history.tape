# notes-undo-history.tape — note overlay, recent history, and undo.
# Run from repo root:
#   vhs docs/casts/tapes/notes-undo-history.tape

Output docs/casts/out/notes-undo-history.gif
Output docs/casts/out/notes-undo-history.webm

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
Type "rm -rf docs/casts/sandbox/notes-undo-history && mkdir -p docs/casts/sandbox/notes-undo-history" Enter
Type "cp docs/casts/fixture/transactions.jsonl docs/casts/sandbox/notes-undo-history/" Enter
Type "cp docs/casts/fixture/labellens.config.json docs/casts/sandbox/notes-undo-history/" Enter
Type "cd docs/casts/sandbox/notes-undo-history" Enter
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

# Add a reviewer note before deciding.
Type "n"
Sleep 1000ms
Type "check receipt"
Sleep 1000ms
Enter
Sleep 1500ms

# Accept the annotated record so it appears in recent history.
Type "a"
Sleep 2200ms

# Undo restores focus to the compensated record and keeps the audit row visible.
Type "u"
Sleep 4200ms

# Quit.
Type "q"
Sleep 1500ms
