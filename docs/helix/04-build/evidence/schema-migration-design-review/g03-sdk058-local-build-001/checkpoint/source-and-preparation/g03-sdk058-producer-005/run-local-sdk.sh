#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'usage: %s SOURCE_VOLUME EXPECTED_SOURCE_COMMIT EXPECTED_SOURCE_TREE OUTPUT_DIRECTORY\n' "$0" >&2
  exit 64
}

[[ $# -eq 4 ]] || usage
script_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
exec python3 "$script_dir/run-local-sdk-supervisor.py" "$@"
