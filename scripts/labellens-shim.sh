#!/usr/bin/env bash
# Wrapper shim for the compiled labellens binary.
# Sets OTUI_TREE_SITTER_WORKER_PATH so OpenTUI finds the bundled tree-sitter
# worker, then execs the real binary with the same argv.
#
# Resolves its own path through any number of symlinks so `ln -s
# install/dir/labellens ~/.local/bin/labellens` works — the curl-installer
# (install.sh, issue #63) lays the install out exactly that way. macOS doesn't
# ship GNU `readlink -f`, so we walk the chain by hand.

set -e

resolve_self() {
  local src="$1"
  local count=0
  # Cap at 10 hops — same defensive limit GNU `readlink -f` uses internally.
  # A self-referencing or cyclical symlink would otherwise hang the shim
  # forever; bail loudly so the failure is actionable.
  while [ -L "$src" ] && [ "$count" -lt 10 ]; do
    count=$((count + 1))
    local dir
    dir="$(cd "$(dirname "$src")" && pwd -P)"
    src="$(readlink "$src")"
    case "$src" in
      /*) ;;
      *) src="$dir/$src" ;;
    esac
  done
  if [ -L "$src" ]; then
    echo "labellens shim: symlink loop detected at $src" >&2
    exit 1
  fi
  echo "$src"
}

SELF="$(resolve_self "${BASH_SOURCE[0]}")"
DIR="$(cd "$(dirname "$SELF")" && pwd -P)"
export OTUI_TREE_SITTER_WORKER_PATH="$DIR/parser.worker.js"
exec "$DIR/labellens.bin" "$@"
