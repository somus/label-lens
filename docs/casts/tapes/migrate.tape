# migrate.tape — rename a label across stored state, then inspect stats.
# Run from repo root:
#   vhs docs/casts/tapes/migrate.tape

Output docs/casts/out/migrate.gif
Output docs/casts/out/migrate.webm

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
Type "rm -rf docs/casts/sandbox/migrate && mkdir -p docs/casts/sandbox/migrate" Enter
Type "cp docs/casts/fixture/transactions.jsonl docs/casts/sandbox/migrate/" Enter
Type "cp docs/casts/fixture/labellens.config.json docs/casts/sandbox/migrate/" Enter
Type "cd docs/casts/sandbox/migrate" Enter
Type "alias labellens='bun run $REPO/src/main.ts'" Enter
Type "labellens" Enter
Sleep 2500ms
Enter
Sleep 1300ms
Type "a"
Sleep 700ms
Type "a"
Sleep 700ms
Type "a"
Sleep 1000ms
Type "q"
Sleep 1000ms
Type "clear" Enter
Show

Type "labellens migrate --rename shopping:utility"
Sleep 600ms
Enter
Sleep 1800ms

Type "labellens export stats --output migrated"
Sleep 600ms
Enter
Sleep 1200ms

Type "sed -n '1,80p' migrated.stats.md"
Sleep 600ms
Enter
Sleep 5000ms
