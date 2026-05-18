# init.tape — `labellens init transactions.jsonl` flow.
# Embedded in docs/tutorial.md. Run from repo root:
#   vhs docs/casts/tapes/init.tape

Output docs/casts/out/init.gif
Output docs/casts/out/init.webm

Require bun

Set Shell "bash"
Set FontSize 14
Set Width 1100
Set Height 600
Set Theme "Dracula"
Set TypingSpeed 50ms

Env COLORTERM truecolor
Env TERM xterm-256color
Env TERM_PROGRAM iTerm.app
Env NO_COLOR ""

Hide
Type "export PS1='$ '" Enter
Type "REPO=$PWD" Enter
Type "rm -rf docs/casts/sandbox/init && mkdir -p docs/casts/sandbox/init" Enter
Type "cp docs/casts/fixture/transactions.jsonl docs/casts/sandbox/init/" Enter
Type "cd docs/casts/sandbox/init" Enter
Type "alias labellens='bun run $REPO/src/main.ts'" Enter
Type "clear" Enter
Show

Type "ls"
Sleep 300ms
Enter
Sleep 1s

Type "labellens init transactions.jsonl"
Sleep 400ms
Enter
Sleep 4s

Type "ls"
Sleep 300ms
Enter
Sleep 2s
