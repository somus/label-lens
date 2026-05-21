# extraction.tape — extraction task: form-style structured-field correction.
# Run from repo root:
#   vhs docs/casts/tapes/extraction.tape

Output docs/casts/out/extraction.gif
Output docs/casts/out/extraction.webm

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
Type "rm -rf docs/casts/sandbox/extraction && mkdir -p docs/casts/sandbox/extraction" Enter
Type "cp docs/casts/fixture/invoices.extraction.jsonl docs/casts/sandbox/extraction/" Enter
Type "cp docs/casts/fixture/labellens.config.extraction.json docs/casts/sandbox/extraction/labellens.config.json" Enter
Type "cd docs/casts/sandbox/extraction" Enter
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

# Record 1 — Acme, all required fields populated. `a` accepts the
# primary Prediction object verbatim.
Type "a"
Sleep 1500ms

# Record 2 — BetaCorp, missing optional `date`. Open the form, navigate
# down to `date`, edit it to 2026-04-22, commit.
Type "r"
Sleep 1500ms
Down
Sleep 600ms
Down
Sleep 600ms
Type "e"
Sleep 600ms
Type "2026-04-22"
Sleep 900ms
Enter
Sleep 900ms
# Enter (no in-flight edit) commits the Review.
Enter
Sleep 1500ms

# Record 3 — Gamma LLC, missing required `amount`. `a` is refused with
# a flash directing the reviewer to `r`. Open form, edit amount.
Type "a"
Sleep 1500ms
Type "r"
Sleep 1200ms
Down
Sleep 500ms
Type "e"
Sleep 500ms
Type "2400.00"
Sleep 800ms
Enter
Sleep 800ms
Enter
Sleep 1500ms

# Record 4 — Delta, predicted date "May 3" should be ISO. Open form,
# fix the date.
Type "r"
Sleep 1200ms
Down
Sleep 500ms
Down
Sleep 500ms
Type "e"
Sleep 500ms
Backspace 5
Sleep 200ms
Type "2026-05-03"
Sleep 900ms
Enter
Sleep 900ms
Enter
Sleep 1500ms

# Record 5 — no real extraction. Reject.
Type "x"
Sleep 1500ms

# Quit.
Type "q"
Sleep 1500ms
