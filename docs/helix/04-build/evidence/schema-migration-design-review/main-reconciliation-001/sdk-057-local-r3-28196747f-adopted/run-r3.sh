#!/bin/bash
set -euo pipefail
cd /workspace
test "$(git rev-parse HEAD)" = 28196747faf6e5dc358c4aac708e8b377b20f5ee
test -z "$(git status --porcelain)"
export EVIDENCE_DIR=/qualification/r3
test ! -e "$EVIDENCE_DIR" && test ! -L "$EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR/logs" "$EVIDENCE_DIR/outputs"
start="$(awk '{printf "%d", $1 * 1000}' /proc/uptime)"
printf '%s\n' "$start" > "$EVIDENCE_DIR/monotonic-start-ms"
printf '%s\n' "$((start+1800000))" > "$EVIDENCE_DIR/monotonic-deadline-ms"
set -euo pipefail
START_MS="$(cat "$EVIDENCE_DIR/monotonic-start-ms")"
DEADLINE_MS="$(cat "$EVIDENCE_DIR/monotonic-deadline-ms")"
NOW_MS="$(awk '{printf "%d", $1 * 1000}' /proc/uptime)"
REMAINING_SECONDS="$(((DEADLINE_MS - NOW_MS - 60000) / 1000))"
if (( REMAINING_SECONDS <= 0 )); then exit 124; fi
set +e
timeout --signal=TERM --kill-after=10s "${REMAINING_SECONDS}s" bash -euo pipefail <<'BOUNDED_GENERATION_WORK'
EVIDENCE="$EVIDENCE_DIR"
DEADLINE="$EVIDENCE/monotonic-deadline-ms"
run_bounded() {
  local name="$1" maximum="$2" now deadline remaining limit log existing cap started ended status capture_status log_total
  local -a statuses
  shift 2
  now="$(awk '{printf "%d", $1 * 1000}' /proc/uptime)"
  deadline="$(cat "$DEADLINE")"
  remaining=$(((deadline - now - 60000) / 1000))
  if (( remaining <= 0 )); then return 124; fi
  limit="$maximum"; if (( remaining < limit )); then limit="$remaining"; fi
  log="$EVIDENCE/logs/$name.log"
  existing="$(find "$EVIDENCE/logs" -type f -name '*.log' -exec wc -c {} + | awk 'END {print $1+0}')"
  cap=$((1048576 - existing)); if (( cap < 0 )); then cap=0; fi
  started="$now"
  set +e
  timeout --signal=TERM --kill-after=10s "${limit}s" "$@" 2>&1 | python -I -c '
import sys
path, cap = sys.argv[1], int(sys.argv[2])
marker = b"\n[LOG TRUNCATED: aggregate generation log cap reached]\n"
stored = 0
truncated = False
failed = False
try:
    out = open(path, "wb", buffering=0)
except OSError:
    out = None
    failed = True
room_limit = max(0, cap - len(marker))
while True:
    chunk = sys.stdin.buffer.read(65536)
    if not chunk:
        break
    if out is None:
        continue
    room = max(0, room_limit - stored)
    part = chunk[:room]
    if part:
        try:
            out.write(part)
            stored += len(part)
        except OSError:
            failed = True
            out = None
    if len(chunk) > room:
        truncated = True
if out is not None:
    try:
        if truncated:
            out.write(marker[:max(0, cap - stored)])
        out.close()
    except OSError:
        failed = True
sys.exit(74 if failed else 75 if truncated else 0)
' "$log" "$cap"
  statuses=("${PIPESTATUS[@]}")
  set -e
  status="${statuses[0]}"; capture_status="${statuses[1]}"
  ended="$(awk '{printf "%d", $1 * 1000}' /proc/uptime)"
  python -I - "$EVIDENCE/command-records.jsonl" "$log" "$name" "$status" "$capture_status" "$((ended-started))" "$@" <<'PY'
import hashlib,json,pathlib,sys
records,log,name,raw,capture,duration,*argv=sys.argv[1:]
payload=pathlib.Path(log).read_bytes()
record={"name":name,"stage":name,"argv":argv,"rawExit":int(raw),"captureExit":int(capture),
        "monotonicDurationMs":int(duration),"logBytes":len(payload),
        "logSha256":hashlib.sha256(payload).hexdigest(),"truncated":int(capture)==75,
        "truncationMarker":"aggregate generation log cap reached" if int(capture)==75 else None}
with pathlib.Path(records).open("a",encoding="utf-8") as stream: stream.write(json.dumps(record,sort_keys=True)+"\n")
PY
  log_total="$(find "$EVIDENCE/logs" -type f -name '*.log' -exec wc -c {} + | awk 'END {print $1+0}')"
  if (( log_total > 1048576 || status != 0 || capture_status != 0 )); then
    head -c 4096 "$log" >&2 || true
    return 1
  fi
}
run_bounded bun-install 300 bun install --frozen-lockfile --ignore-scripts
run_bounded cargo-fetch 600 cargo fetch --locked
run_bounded r3-inventory 600 python -I scripts/rust-inventory.py
run_bounded r3-boundary-check 900 python -I scripts/check-rust-boundaries.py
cp docs/helix/04-build/evidence/rust-migration/r3/inventory.json "$EVIDENCE/outputs/"
cp docs/helix/04-build/evidence/rust-migration/r3/boundary-check.json "$EVIDENCE/outputs/"
BOUNDED_GENERATION_WORK
work_status=$?
set -e
export R3_WORK_STATUS="$work_status"
python -I - <<'PYEND'
import hashlib, json, os, pathlib, re, stat
p=pathlib.Path(os.environ['EVIDENCE_DIR'])
receipt=p/'local-receipt.json'
image=os.environ.get('LOCAL_RUNTIME_IMAGE_DIGEST','')
tools_raw=os.environ.get('LOCAL_TOOL_VERSIONS_JSON','')
tool_error=None
try:
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', image): raise ValueError('runtime image digest missing or malformed')
    if not tools_raw or len(tools_raw.encode())>4096: raise ValueError('tool version provenance missing or too large')
    tools=json.loads(tools_raw)
    expected={'python','bun','node','rustc','cargo','git','glibc'}
    if not isinstance(tools,dict) or set(tools)!=expected or any(not isinstance(v,str) or not v for v in tools.values()):
        raise ValueError('tool version provenance has an invalid closed shape')
except Exception as exc:
    tool_error=type(exc).__name__
    tools={}

rows=[]
records=p/'command-records.jsonl'
try:
    if records.is_file() and not records.is_symlink():
        data=records.read_bytes()
        if len(data)>65536: raise ValueError('command record file too large')
        rows=[json.loads(line) for line in data.decode('utf-8').splitlines() if line]
except Exception:
    rows=[]
expected_names=['bun-install','cargo-fetch','r3-inventory','r3-boundary-check']
outputs={}
output_error=None
try:
    if not (p/'outputs').is_dir() or (p/'outputs').is_symlink(): raise ValueError('outputs directory missing or unsafe')
    files=sorted((p/'outputs').iterdir())
    if {f.name for f in files}!={'inventory.json','boundary-check.json'}: raise ValueError('output roster mismatch')
    for f in files:
        if f.is_symlink() or not f.is_file(): raise ValueError('output member is not a regular file')
        size=f.stat().st_size
        if size>16777216: raise ValueError('output member exceeds evidence cap')
        payload_bytes=f.read_bytes()
        outputs[f.name]={'sha256':hashlib.sha256(payload_bytes).hexdigest(),'bytes':size}
except Exception as exc:
    output_error=type(exc).__name__

work_status=int(os.environ.get('R3_WORK_STATUS','1'))
commands_ok=(
    [row.get('name') for row in rows]==expected_names
    and all(row.get('rawExit')==0 and row.get('captureExit')==0 and not row.get('truncated') for row in rows)
)
source_commit='28196747faf6e5dc358c4aac708e8b377b20f5ee'
base={
    'profile':'umf.local-linux-targeted-r3/1',
    'execution':'local-linux-container-diagnostic-only',
    'executionKind':'local_linux_diagnostic',
    'sourceCommit':source_commit,
    'localExecutionId':os.environ.get('LOCAL_EXECUTION_ID','unknown-local-execution'),
    'localSourceRef':os.environ.get('LOCAL_SOURCE_REF','unknown-local-ref'),
    'runtimeImageDigest':image or None,
    'toolVersions':tools,
    'toolVersionsSha256':hashlib.sha256(tools_raw.encode()).hexdigest() if tools_raw else None,
    'commands':rows,
    'outputs':outputs,
    'limits':{'aggregateSeconds':1800,'evidenceReserveSeconds':60,'logBytes':1048576,'evidenceBytes':16777216},
    'scope':'Actual R3 inventory and boundary generation only; previous unchanged generation-family outputs retain their actual producer identity.',
}
failures=[]
if work_status!=0: failures.append('bounded-generation-command-failed')
if not commands_ok: failures.append('command-roster-or-result-incomplete')
if output_error: failures.append('output-roster-or-custody-invalid')
if tool_error: failures.append('local-runtime-tool-provenance-invalid')
total=0
for f in p.rglob('*'):
    if f==receipt: continue
    if f.is_symlink():
        failures.append('unsafe-symlink-in-evidence-family')
        continue
    if f.is_file(): total+=f.stat().st_size
payload={**base,'status':'PASS_TARGETED_R3' if not failures else 'FAIL_OR_UNKNOWN','failureCodes':failures,'boundedWorkExit':work_status}
body=(json.dumps(payload,sort_keys=True,indent=2)+'\n').encode()
if total+len(body)>16777216:
    payload={
        'profile':'umf.local-linux-targeted-r3/1','executionKind':'local_linux_diagnostic',
        'status':'FAIL_OR_UNKNOWN','sourceCommit':source_commit,
        'localExecutionId':base['localExecutionId'],'localSourceRef':base['localSourceRef'],
        'runtimeImageDigest':base['runtimeImageDigest'],'toolVersionsSha256':base['toolVersionsSha256'],
        'failureCodes':['evidence-family-cap-including-receipt'],'boundedWorkExit':work_status,
    }
    body=(json.dumps(payload,sort_keys=True,indent=2)+'\n').encode()
    if total+len(body)>16777216:
        raise SystemExit('evidence family already exceeds16MiB; cannot write an in-family receipt within the unchanged cap')
receipt.write_bytes(body)
if payload['status']!='PASS_TARGETED_R3': raise SystemExit('local R3 diagnostic ended FAIL_OR_UNKNOWN; see bounded receipt/logs')
PYEND
