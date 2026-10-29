set -euo pipefail
test ! -e "$D5_ROOT"
now_ms="$(awk '{printf "%d", $1 * 1000}' /proc/uptime)"
mkdir -p "$D5_ROOT/evidence/logs" "$D5_ROOT/evidence/reports" "$D5_ROOT/evidence/replay" "$D5_ROOT/upload"
printf '%s\n' "$now_ms" > "$D5_ROOT/monotonic-start-ms"
printf '%s\n' "$((now_ms + 1800000))" > "$D5_ROOT/monotonic-deadline-ms"
python -I - "$D5_ROOT/upload/d5-receipt.json" "$GITHUB_SHA" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_REF" <<'PY'
import json, pathlib, sys
path, source, run_id, attempt, ref = sys.argv[1:]
pathlib.Path(path).write_text(json.dumps({
    "status": "FAIL_OR_UNKNOWN", "scope": "G02-D5 independent native replay",
    "sourceCommit": source, "runId": run_id, "runAttempt": attempt,
    "ref": ref, "reason": "finalizer has not validated the fixed report and cleanup roster"
}, sort_keys=True) + "\n")
PY

