set -euo pipefail
test ! -e "$D5_ROOT"
export LOCAL_RESOURCE_PROFILE=LOCAL_EMULATED_3600
now_ms="$(awk '{printf "%d", $1 * 1000}' /proc/uptime)"
mkdir -p "$D5_ROOT/evidence/logs" "$D5_ROOT/evidence/reports" "$D5_ROOT/evidence/replay" "$D5_ROOT/upload"
printf '%s\n' "$now_ms" > "$D5_ROOT/monotonic-start-ms"
printf '%s\n' "$((now_ms + 3600000))" > "$D5_ROOT/monotonic-deadline-ms"
python -I - "$D5_ROOT/upload/d5-receipt.json" "$LOCAL_SOURCE_COMMIT" "$LOCAL_EXECUTION_ID" "$LOCAL_ATTEMPT" "$LOCAL_SOURCE_REF" "$LOCAL_SOURCE_BRANCH" "$LOCAL_WORKFLOW_ID" <<'PY'
import json, pathlib, sys
path, source, run_id, attempt, ref, branch, workflow = sys.argv[1:]
pathlib.Path(path).write_text(json.dumps({
    "status": "FAIL_OR_UNKNOWN", "scope": "G02-D5 independent native replay", "executionKind": "local_linux_diagnostic",
    "sourceCommit": source, "localExecutionId": run_id, "localAttempt": attempt,
    "localSourceRef": ref, "localSourceBranch": branch, "adapterWorkflow": workflow, "resourceProfile": "LOCAL_EMULATED_3600", "resourceProfileSha256": __import__("os").environ["LOCAL_RESOURCE_PROFILE_SHA"], "operatorHashes": json.loads(__import__("os").environ["LOCAL_OPERATOR_HASHES"]), "aggregateSeconds": 3600, "reason": "finalizer has not validated the fixed report and cleanup roster"
}, sort_keys=True) + "\n")
PY

