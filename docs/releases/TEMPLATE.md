# Release smoke checklist — `<version>`

Date: `YYYY-MM-DD`
Release captain: `@<handle>`
Tag: `v<x.y.z>`

## Automated gates

- [ ] CI green on the release branch (`check` + `perf` jobs)
- [ ] `bun run build:bin` succeeds for each target platform

## Manual SSH smoke (PRD §16.1)

Keystroke-to-render over SSH is not enforced by the perf harness (the headless
test renderer doesn't model transport loss). Verify by hand against a real
remote host before tagging.

- [ ] Connect via SSH to a remote host (e.g. a development EC2 / mac / linux box).
- [ ] Launch the compiled binary against a `medium`-sized dataset (~10K records).
- [ ] Press `j` / `k` / `a` / `r` in the review screen and confirm each keystroke
      renders within ~100ms by eye — no perceptible lag, no dropped chord.
- [ ] Confirm the candidate band repaints cleanly (no half-drawn frames) when
      cycling through 20+ records quickly.
- [ ] Confirm OSC 52 yank (`y`) round-trips to the local clipboard.

If any check fails, capture the terminal type (`$TERM`, `$COLORTERM`) and the
SSH client, file an issue, and block the release.

## Distribution

- [ ] `parser.worker.js` is present alongside the binary in each platform package
- [ ] Markdown rendering works in the compiled binary launched from a fresh
      directory (per PRD §16.1)
- [ ] Brew formula / npm sub-package versions bumped

## Sign-off

- [ ] Release notes drafted
- [ ] Tag pushed
- [ ] Brew / npm publish completed
