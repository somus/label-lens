# multi-label.tape — multi-label task: chip rail, digit toggle, picker.
# Run from repo root:
#   vhs docs/casts/tapes/multi-label.tape

Output docs/casts/out/multi-label.gif
Output docs/casts/out/multi-label.webm

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
Type "rm -rf docs/casts/sandbox/multi-label && mkdir -p docs/casts/sandbox/multi-label" Enter
Type "cp docs/casts/fixture/comments.multilabel.jsonl docs/casts/sandbox/multi-label/" Enter
Type "cp docs/casts/fixture/labellens.config.multilabel.json docs/casts/sandbox/multi-label/labellens.config.json" Enter
Type "cd docs/casts/sandbox/multi-label" Enter
Type "alias labellens='bun run $REPO/src/main.ts'" Enter
Type "clear" Enter
Show

Type "labellens"
Sleep 300ms
Enter
Sleep 2500ms

# Queue picker — accept default 'Pending'.
Enter
Sleep 2000ms

# Record 1 — predicted set {spam, promotion}. Digit `1` toggles spam out of
# the draft; the chip rail diff glyphs flip and the section header shows the
# relabel intent.
Type "1"
Sleep 1800ms
Enter
Sleep 1800ms

# Record 2 — open the picker overlay (richer, filterable, supports >9 labels).
Type "r"
Sleep 1800ms
# Highlight `off-topic` (index 4) and toggle it on with Space.
Type "4"
Sleep 900ms
Space
Sleep 1500ms
Enter
Sleep 1800ms

# Record 3 — empty predicted set. Toggle `self-promo` in with key 6, commit.
Type "6"
Sleep 1500ms
Enter
Sleep 1800ms

# Record 4 — predicted matches truth, accept as-is.
Type "a"
Sleep 1500ms

# Record 5 — reject (no labels apply).
Type "x"
Sleep 1500ms

# Quit.
Type "q"
Sleep 1500ms
