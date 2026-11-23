#!/usr/bin/env bash
# Runs the whole Python suite under another interpreter, using the native extension and CLI that the CI
# build already compiled (target/debug), in a throwaway virtual environment.
set -euo pipefail
python="$1"
venv="$RUNNER_TEMP/venv-$python"
"$python" -m venv "$venv"
"$venv/bin/python" -m pip install -q pytest pytest-xdist packaging 'hatchling>=1.27,<2' 'psycopg[binary]' 'cryptography==50.0.2'
UMF_NATIVE_PREBUILT_DIR="$PWD/target/debug" "$venv/bin/python" -m pip install -q --no-build-isolation ./python ./python/umf_codegen ./python/umf_access
"$venv/bin/python" -m pip install -q --no-deps --no-build-isolation ./python/umf_access_generated_executor
"$venv/bin/python" -m pytest -q -p no:cacheprovider -n 4 --dist loadfile python/tests python/umf_codegen/tests python/umf_access/tests tools/tests
