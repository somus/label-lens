# export-stats.tape — export a Markdown stats report after a short review pass.
# Run from repo root:
#   vhs docs/casts/tapes/export-stats.tape

Output docs/casts/out/export-stats.gif
Output docs/casts/out/export-stats.webm

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
Type "rm -rf docs/casts/sandbox/export-stats && mkdir -p docs/casts/sandbox/export-stats" Enter
Type "cp docs/casts/fixture/transactions.jsonl docs/casts/sandbox/export-stats/" Enter
Type "cp docs/casts/fixture/labellens.config.json docs/casts/sandbox/export-stats/" Enter
Type "cd docs/casts/sandbox/export-stats" Enter
Type "alias labellens='bun run $REPO/src/main.ts'" Enter
Type "labellens" Enter
Sleep 2500ms
Enter
Sleep 1300ms
Type "a"
Sleep 700ms
Type "a"
Sleep 700ms
Type "4"
Sleep 700ms
Type "s"
Sleep 700ms
Type "a"
Sleep 700ms
Type "q"
Sleep 1000ms
Type "clear" Enter
Show

Type "labellens export stats --output reviewed"
Sleep 600ms
Enter
Sleep 1200ms

Type "sed -n '1,80p' reviewed.stats.md"
Sleep 600ms
Enter
Sleep 5000ms
