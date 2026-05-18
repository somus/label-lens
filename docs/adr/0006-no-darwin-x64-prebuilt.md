# Don't ship a darwin-x64 prebuilt (SUPERSEDED 2026-05-18)

**Status: SUPERSEDED.** darwin-x64 ships as a prebuilt binary as of the next release. Bun ≥ 1.3.11 installs foreign-arch optional deps reliably via `bun add --no-save --force --cpu=x64 --os=darwin @opentui/core-darwin-x64@<v>`, which unblocks the cross-compile from a macos-14 (arm64) host. Verified locally: `bun build --compile --target=bun-darwin-x64` produces a valid Mach-O x86_64 binary. `release.yml` now runs the darwin-x64 build on `macos-14` alongside darwin-arm64 — no macos-13 queueing.

`scripts/build-npm.ts`, `scripts/npm-launcher.mjs`, and `install.sh` all include darwin-x64 in their platform maps. Intel Mac users can install via curl or npm like every other supported target.

Original ADR preserved below for historical context.

---

LabelLens publishes prebuilt binaries for macOS arm64, Linux arm64, and Linux x64. **darwin-x64 (Intel Mac) is intentionally omitted** from `release.yml`, `optionalDependencies`, the curl-installer, and the npm launcher's platform map.

Two stacked obstacles:

1. **GitHub's macos-13 runner pool is starved** — the v0.0.1 attempt queued darwin-x64 for 35+ minutes while the other three builds finished. macos-13 is GitHub's only x64 macOS runner.
2. **Bun cross-compile from arm64 → x64 fails for OpenTUI** — OpenTUI ships platform-specific native libs as `optionalDependencies`. Building for darwin-x64 from a macos-14 (arm64) host emits `error: Could not resolve "@opentui/core-darwin-x64/index.ts"` because Bun installs only the host-matching optional dep and `bun build --compile --target` doesn't force-install the foreign one. Confirmed in PR #18 retry.

Apple stopped selling Intel Macs in 2023. The target user (solo dev, NLP hobbyist, indie hacker) is overwhelmingly on Apple silicon by 2026. resume-extract — the reference repo for our release pipeline — also omits darwin-x64.

## Considered alternatives

- **Pin darwin-x64 to macos-13 runner** — works but introduces 30+ min queue delays per release. Trades reliability for an actively shrinking user population.
- **Cross-compile from macos-14** — blocked by OpenTUI's native-lib optionalDependencies (see #2 above).
- **Manually install foreign-platform optional deps before compile** — `bun add --no-save @opentui/core-darwin-x64@<v>` skips the host check via `--cpu=x64 --os=darwin`. Tried in PR #18; Bun doesn't expose those flags reliably for optional deps.
- **Drop OpenTUI for a pure-JS renderer** — far bigger scope. PRD §16 commits to OpenTUI for MVP.

## Consequences

- Intel Mac users who run `npm install -g label-lens` get a no-binary error from the npm launcher (`PLATFORM_MAP` no longer contains `darwin-x64`).
- The curl-installer detects darwin-x64 and exits with a "build from source" message.
- `scripts/build-bin.ts` still supports `darwin-x64` as a target argument so anyone on Intel Mac can build locally.
- Reconsider when: Bun ships proper foreign-optional-dep installation, OR OpenTUI moves off native libs, OR macOS x64 user count drops below noise (then drop the local-build affordance too).
