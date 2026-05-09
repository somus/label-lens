#!/usr/bin/env bash
# Wrapper shim for the compiled labellens binary.
# Sets OTUI_TREE_SITTER_WORKER_PATH so OpenTUI finds the bundled tree-sitter
# worker, then execs the real binary with the same argv.

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
export OTUI_TREE_SITTER_WORKER_PATH="$DIR/parser.worker.js"
exec "$DIR/labellens.bin" "$@"
