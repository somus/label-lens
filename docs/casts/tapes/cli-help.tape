# cli-help.tape — `labellens --help` and `labellens guide` snippets.
# Embedded in README docs section. Run from repo root:
#   vhs docs/casts/tapes/cli-help.tape

Output docs/casts/out/cli-help.gif
Output docs/casts/out/cli-help.webm

Require bun

Set Shell "bash"
Set FontSize 14
Set Width 1100
Set Height 600
Set Theme "Dracula"
Set TypingSpeed 40ms
Set PlaybackSpeed 1.0

Env COLORTERM truecolor
Env TERM xterm-256color
Env TERM_PROGRAM iTerm.app
Env NO_COLOR ""

Hide
Type "export PS1='$ '" Enter
Type "alias labellens='bun run src/main.ts'" Enter
Type "clear" Enter
Show

Type "labellens --help"
Sleep 400ms
Enter
Sleep 1800ms

# The help text is longer than the viewport; scroll back so viewers see
# the command shape from the top before moving on.
ScrollUp 40
Sleep 3500ms
ScrollDown 18
Sleep 1500ms

Type "clear" Enter
Sleep 200ms

Type "labellens guide | head -30"
Sleep 400ms
Enter
Sleep 4s
