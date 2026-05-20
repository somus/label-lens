# boundary-review.tape — boundary task context bands and document view.
# Run from repo root:
#   vhs docs/casts/tapes/boundary-review.tape

Output docs/casts/out/boundary-review.gif
Output docs/casts/out/boundary-review.webm

Require bun

Set Shell "bash"
Set FontSize 14
Set Width 1600
Set Height 1000
Set Theme "Dracula"
Set TypingSpeed 40ms

Env COLORTERM truecolor
Env TERM xterm-256color
Env TERM_PROGRAM iTerm.app
Env NO_COLOR ""

Hide
Type "export PS1='$ '" Enter
Type "REPO=$PWD" Enter
Type "rm -rf docs/casts/sandbox/boundary-review && mkdir -p docs/casts/sandbox/boundary-review" Enter
Type "cp docs/casts/fixture/boundary-lines.jsonl docs/casts/sandbox/boundary-review/" Enter
Type "cp docs/casts/fixture/labellens.config.boundary.json docs/casts/sandbox/boundary-review/labellens.config.json" Enter
Type "cd docs/casts/sandbox/boundary-review" Enter
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

# Move to a low-confidence boundary prediction in the middle of document context.
Down
Sleep 1800ms

# Inspect the whole document without changing the active review cursor.
Type "d"
Sleep 1800ms
Down
Sleep 900ms
Down
Sleep 900ms
Down
Sleep 900ms
Escape
Sleep 1500ms

# Correct the job-title line from CONTINUATION to ENTRY_START.
Type "2"
Sleep 1800ms

# Accept the next continuation line, then quit.
Type "a"
Sleep 1500ms
Type "q"
Sleep 1500ms
