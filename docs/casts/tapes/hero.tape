# hero.tape — review loop demo for README hero.
# Run from repo root:
#   vhs docs/casts/tapes/hero.tape

Output docs/casts/out/hero.gif
Output docs/casts/out/hero.webm

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
Type "rm -rf docs/casts/sandbox/hero && mkdir -p docs/casts/sandbox/hero" Enter
Type "cp docs/casts/fixture/transactions.jsonl docs/casts/sandbox/hero/" Enter
Type "cp docs/casts/fixture/labellens.config.json docs/casts/sandbox/hero/" Enter
Type "cd docs/casts/sandbox/hero" Enter
Type "alias labellens='bun run $REPO/src/main.ts'" Enter
Type "clear" Enter
Show

Type "labellens"
Sleep 300ms
Enter
Sleep 2500ms

# First-launch queue picker — accept default 'Pending'.
Enter
Sleep 1500ms

# Accept the good food prediction.
Type "a"
Sleep 1200ms

# Accept the travel one.
Type "a"
Sleep 1200ms

# Shopping prediction is low confidence — relabel to utility (Amazon order ambiguous, demo).
Type "r"
Sleep 800ms
Type "utility"
Sleep 600ms
Enter
Sleep 1500ms

# Netflix — relabel utility via quick key (4 = utility in inferred order).
Type "4"
Sleep 1500ms

# Salary — accept.
Type "a"
Sleep 1000ms

# Rent — accept.
Type "a"
Sleep 1000ms

# Coffee — accept.
Type "a"
Sleep 1000ms

# ATM withdrawal — skip (uncertain).
Type "s"
Sleep 1500ms

# Quit.
Type "q"
Sleep 1500ms
