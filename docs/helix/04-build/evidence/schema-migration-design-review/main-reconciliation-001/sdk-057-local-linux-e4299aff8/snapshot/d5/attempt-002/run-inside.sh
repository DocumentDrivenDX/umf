#!/usr/bin/env bash
set -uo pipefail
cd /workspace
export D5_ROOT=/d5-host/d5
export PG_DSN="host=127.0.0.1 port=5432 dbname=postgres user=postgres application_name=umf_g02_d5_local connect_timeout=5 options='-c statement_timeout=120000 -c lock_timeout=5000'"
export LOCAL_EXECUTION_KIND=local_linux_diagnostic
export LOCAL_EXECUTION_ID="$D5_LOCAL_EXECUTION_ID"
export LOCAL_ATTEMPT=1
export LOCAL_SOURCE_COMMIT="$D5_SOURCE_COMMIT"
export LOCAL_SOURCE_REF="$D5_SOURCE_REF"
export LOCAL_SOURCE_BRANCH="$D5_SOURCE_BRANCH"
export LOCAL_WORKFLOW_ID="local-access-boundaries-$D5_WORKFLOW_SHA"
export LOCAL_RUNTIME_IMAGE_DIGEST="$D5_IMAGE_ID"

status=0
bash /adapter/steps/initialize.local.sh || status=$?
if [[ "$status" -eq 0 ]]; then bash /adapter/steps/replay.local.sh || status=$?; fi
final_status=0
if [[ -d "$D5_ROOT" ]]; then timeout --signal=TERM --kill-after=10s 60s bash /adapter/steps/finalize.local.sh || final_status=$?; else final_status=1; fi
if [[ "$status" -ne 0 || "$final_status" -ne 0 ]]; then exit 1; fi
