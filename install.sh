#!/usr/bin/env bash
# LabelLens curl-installer.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/somus/label-lens/main/install.sh | sh
#
# Env overrides:
#   LL_VERSION    install a specific tag instead of latest
#   LL_PREFIX     install dir (default: $XDG_DATA_HOME/label-lens or ~/.local/share/label-lens)
#   LL_BIN_DIR    bin symlink dir (default: ~/.local/bin)

set -euo pipefail

REPO="somus/label-lens"
GH="https://github.com/${REPO}"
API="https://api.github.com/repos/${REPO}"

LL_VERSION="${LL_VERSION:-}"
LL_PREFIX="${LL_PREFIX:-${XDG_DATA_HOME:-$HOME/.local/share}/label-lens}"
LL_BIN_DIR="${LL_BIN_DIR:-$HOME/.local/bin}"

err() { echo "label-lens installer: $*" >&2; exit 1; }
log() { echo "label-lens installer: $*"; }

# Move the tmp dir to file scope so the EXIT trap can clean up after main()
# returns — `set -u` would otherwise abort on the `$tmp` reference once the
# local goes out of scope.
TMP=""
cleanup() {
  if [ -n "${TMP}" ] && [ -d "${TMP}" ]; then
    rm -rf "${TMP}"
  fi
}
trap cleanup EXIT

detect_target() {
  local os arch target
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux)  os=linux  ;;
    *) err "unsupported OS: $(uname -s). Supported: macOS, Linux." ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch=arm64 ;;
    x86_64|amd64)  arch=x64   ;;
    *) err "unsupported arch: $(uname -m). Supported: arm64, x86_64." ;;
  esac
  target="${os}-${arch}"
  echo "$target"
}

resolve_version() {
  if [ -n "$LL_VERSION" ]; then
    echo "$LL_VERSION"
    return
  fi
  curl -fsSL "${API}/releases/latest" \
    | grep -m1 '"tag_name"' \
    | sed -E 's/.*"tag_name":[[:space:]]*"([^"]+)".*/\1/'
}

# Verify the downloaded tarball's SHA256 against the release's manifest.
# release.yml emits SHA256SUMS.txt alongside the per-target tarballs.
# Missing manifest (legacy releases) → warn loudly but proceed; checksum
# mismatch → fatal.
# Known artifact set we ship in each tarball. Tarballs contain only these
# three files; we remove them (if present) from LL_PREFIX before extracting
# the new version. Anything else the user dropped in LL_PREFIX stays put.
#
# When a future release adds a file, add its name here. Forgetting to add
# it leaks a stale copy on upgrade — which is bad — but never destructive.
LL_ARTIFACTS="labellens labellens.bin parser.worker.js"

remove_prior_install_artifacts() {
  local prefix="$1"
  local f
  for f in $LL_ARTIFACTS; do
    if [ -e "${prefix}/${f}" ] || [ -L "${prefix}/${f}" ]; then
      rm -f "${prefix}/${f}"
    fi
  done
}

verify_checksum() {
  local tarball="$1" target="$2" version="$3"
  local tarball_name="label-lens-${target}.tar.gz"
  local manifest_url="${GH}/releases/download/${version}/SHA256SUMS.txt"
  local manifest="${tarball}.sums"
  if ! curl -fsSL -o "$manifest" "$manifest_url" 2>/dev/null; then
    log "warning: SHA256SUMS.txt not found at ${manifest_url}"
    log "warning: continuing without integrity verification"
    return
  fi
  local expected
  expected="$(awk -v name="$tarball_name" '$2 == name { print $1 }' "$manifest")"
  if [ -z "$expected" ]; then
    log "warning: no entry for ${tarball_name} in SHA256SUMS.txt; skipping"
    return
  fi
  local actual
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$tarball" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$tarball" | awk '{print $1}')"
  else
    log "warning: neither sha256sum nor shasum present; skipping integrity check"
    return
  fi
  if [ "$expected" != "$actual" ]; then
    err "checksum mismatch for ${tarball_name}
  expected: ${expected}
  actual:   ${actual}"
  fi
  log "checksum ok (${actual:0:12}…)"
}

main() {
  for cmd in curl tar uname; do
    command -v "$cmd" >/dev/null || err "missing required command: $cmd"
  done

  local target version url
  target="$(detect_target)"
  version="$(resolve_version)"
  [ -n "$version" ] || err "could not resolve version (no LL_VERSION and no GitHub release found)"

  log "installing label-lens ${version} for ${target}"
  url="${GH}/releases/download/${version}/label-lens-${target}.tar.gz"

  TMP="$(mktemp -d)"
  local tmp="$TMP"

  log "downloading ${url}"
  curl -fsSL "$url" -o "$tmp/pkg.tar.gz" || err "download failed (does this release exist?)"

  verify_checksum "$tmp/pkg.tar.gz" "$target" "$version"

  log "extracting to ${LL_PREFIX}"
  mkdir -p "$LL_PREFIX"
  # Scoped cleanup of prior install (codex P1 #67): never wipe the whole
  # prefix dir — reviewer may have set LL_PREFIX to a shared location. Only
  # remove the known LabelLens artifacts we own; leave anything else alone.
  # Track new files via a manifest so a future addition (e.g. a second
  # bundled worker) still gets cleaned up on the next install.
  remove_prior_install_artifacts "$LL_PREFIX"
  tar -xzf "$tmp/pkg.tar.gz" -C "$LL_PREFIX" --strip-components=1

  mkdir -p "$LL_BIN_DIR"
  ln -sf "${LL_PREFIX}/labellens" "${LL_BIN_DIR}/labellens"

  log "installed: ${LL_BIN_DIR}/labellens -> ${LL_PREFIX}/labellens"
  case ":$PATH:" in
    *:"$LL_BIN_DIR":*) ;;
    *) log "note: ${LL_BIN_DIR} is not in your PATH. Add this to your shell rc:"
       log "   export PATH=\"${LL_BIN_DIR}:\$PATH\"" ;;
  esac
}

main "$@"
