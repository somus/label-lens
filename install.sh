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

main() {
  for cmd in curl tar uname; do
    command -v "$cmd" >/dev/null || err "missing required command: $cmd"
  done

  local target version url tmp
  target="$(detect_target)"
  version="$(resolve_version)"
  [ -n "$version" ] || err "could not resolve version (no LL_VERSION and no GitHub release found)"

  log "installing label-lens ${version} for ${target}"
  url="${GH}/releases/download/${version}/label-lens-${target}.tar.gz"

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  log "downloading ${url}"
  curl -fsSL "$url" -o "$tmp/pkg.tar.gz" || err "download failed (does this release exist?)"

  log "extracting to ${LL_PREFIX}"
  mkdir -p "$LL_PREFIX"
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
