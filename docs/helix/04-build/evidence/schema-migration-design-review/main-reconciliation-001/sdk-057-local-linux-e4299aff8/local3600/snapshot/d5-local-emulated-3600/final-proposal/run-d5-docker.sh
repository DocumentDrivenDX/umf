#!/usr/bin/env bash
set -euo pipefail

RESOURCE_PROFILE=LOCAL_EMULATED_3600

# Local-only Docker execution of the three source-extracted D5 workflow steps.
# Nothing starts unless the caller explicitly sets D5_EXECUTE=1 and supplies a
# route frozen to the exact source/cohort. This produces diagnostic evidence,
# never hosted qualification evidence.

ROOT="$(cd "$(dirname "$0")" && pwd -P)"
ROUTE="${D5_PREPARED_ROUTE:-$ROOT/prepared-route.json}"
COHORT="${D5_COHORT_DIR:-}"
SOURCE_VOLUME="${D5_SOURCE_VOLUME:-}"
OUT="${D5_OUTPUT_DIR:-}"
D5_IMAGE="sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556"
PG_IMAGE="sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336"

fail() { printf 'D5 local preflight: %s\n' "$1" >&2; exit 2; }
[[ "${D5_EXECUTE:-}" == 1 ]] || fail 'set D5_EXECUTE=1 only after the final producer and current-source cohort are accepted'
[[ -f "$ROUTE" && ! -L "$ROUTE" ]] || fail 'prepared route is missing or unsafe'
[[ -n "$COHORT" && -d "$COHORT" && ! -L "$COHORT" ]] || fail 'current-source 18-wheel cohort directory is required'
[[ -n "$SOURCE_VOLUME" && "$SOURCE_VOLUME" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]] || fail 'a dedicated source Docker volume name is required'
[[ -n "$OUT" && ! -e "$OUT" && ! -L "$OUT" ]] || fail 'fresh output directory path is required'
COHORT="$(cd "$COHORT" && pwd -P)"
OUT_PARENT="$(cd "$(dirname "$OUT")" && pwd -P)"
OUT="$OUT_PARENT/$(basename "$OUT")"
mkdir -p "$(dirname "$OUT")"

eval "$(python3 - "$ROUTE" "$COHORT" "$ROOT" <<'PY'
import hashlib,json,pathlib,re,shlex,sys
route=json.loads(pathlib.Path(sys.argv[1]).read_text())
cohort=pathlib.Path(sys.argv[2]).resolve(strict=True)
root=pathlib.Path(sys.argv[3]).resolve(strict=True)
if route.get('status')!='PREPARED_NOT_EXECUTED' or not route.get('hostedEvidenceClaim') is False or route.get('resourceProfile')!='LOCAL_EMULATED_3600' or route.get('localAttempt')!=1:
    raise SystemExit('route is not prepared against a verified current-source cohort')
source=route.get('source',{}); c=route.get('cohort',{}); bounds=route.get('bounds',{})
if bounds.get('aggregateSeconds')!=3600 or bounds.get('boundedCommandCount')!=30 or bounds.get('oracleCases')!=37 or bounds.get('oracleGroups')!=16 or bounds.get('noDefaultChecks')!=19 or bounds.get('faultScenarios')!=3 or bounds.get('childSeconds')!=180 or bounds.get('aggregateLogBytes')!=1048576 or bounds.get('evidenceBytes')!=16777216 or bounds.get('releasePayloadBytes')!=2097152:
    raise SystemExit('LOCAL_EMULATED_3600 route budgets or frozen D5 scope differ')
if source.get('head')!='e4299aff8e87e9d211f9d86df2f2013ab9c95945' or source.get('tree')!='8b98c0d895983ba2b7637dd3aea567dab0943883':
    raise SystemExit('route does not identify the reviewed e429 source snapshot')
if source.get('workflowSha256')!='f0963d2df1e371112ba6e57999dbf69290796d711eb97ed46637d4ebc63918a1':
    raise SystemExit('route workflow identity is stale')
if c.get('status')!='VERIFIED_EXACT_CURRENT_SOURCE_COHORT' or c.get('producerSourceCommit')!=source['head']:
    raise SystemExit('current-source cohort is not verified against the exact source HEAD')
if c.get('path')!=str(cohort) or c.get('physicalWheels')!=18 or c.get('wheelRows')!=18 or c.get('packages')!=18:
    raise SystemExit('cohort path or exact 18-package/wheel roster differs')
if not re.fullmatch(r'[0-9a-f]{64}',c.get('lockSha256','')):
    raise SystemExit('cohort lock digest is missing')
steps=root/'steps'
expected_source={'initialize.sh','replay.sh','finalize.sh'}
expected_local={'initialize.local.sh','replay.local.sh','finalize.local.sh'}
expected=expected_source|expected_local
step_files=list(steps.iterdir())
if {p.name for p in step_files}!=expected or any(p.is_symlink() or not p.is_file() for p in step_files):
    raise SystemExit('source and adapted step roster is not the exact six regular files')
manifest_path=root/'local-adapter-manifest.json'
if manifest_path.is_symlink() or not manifest_path.is_file():
    raise SystemExit('local adapter manifest is missing or unsafe')
manifest=json.loads(manifest_path.read_text())
if (set(manifest)!={'executionKind','hostedEvidenceClaim','sourceWorkflowSha256','adapterPurpose','sourceSteps','stepCopies','boundsPreserved','candidateExecutionPerformed','resourceProfile','nonTemporalBoundsPreserved','resourceProfileSha256'}
    or manifest.get('executionKind')!='local_linux_diagnostic' or manifest.get('hostedEvidenceClaim') is not False
    or manifest.get('sourceWorkflowSha256')!=source['workflowSha256'] or manifest.get('boundsPreserved') is not False or manifest.get('nonTemporalBoundsPreserved') is not True
    or manifest.get('candidateExecutionPerformed') is not False or manifest.get('resourceProfile')!='LOCAL_EMULATED_3600'
    or set(manifest.get('sourceSteps',{}))!=expected_source
    or set(manifest.get('stepCopies',{}))!=expected_local):
    raise SystemExit('local adapter manifest is not the exact closed six-step custody record')
profile_path=root/'resource-profile.json'
profile=json.loads(profile_path.read_text())
if hashlib.sha256(profile_path.read_bytes()).hexdigest()!=manifest['resourceProfileSha256'] or profile.get('profile')!='LOCAL_EMULATED_3600' or profile.get('aggregateSeconds')!=3600 or profile.get('workSeconds')!=3530 or profile.get('evidenceReserveSeconds')!=60 or profile.get('killGraceSeconds')!=10 or profile.get('childSeconds')!=180 or profile.get('cases')!=37 or profile.get('oracleGroups')!=16 or profile.get('noDefaultChecks')!=19 or profile.get('faultScenarios')!=3 or profile.get('orderedCommands')!=30 or profile.get('rawLogBytes')!=1048576 or profile.get('childRawLogReservationBytes')!=786432 or profile.get('outerRawLogReservationBytes')!=262144 or profile.get('evidenceBytes')!=16777216 or profile.get('payloadBytes')!=2097152 or profile.get('productApiBudgetChanged') is not False:
    raise SystemExit('resource profile identity, hash, or frozen scope differs')
for name,record in {**manifest['sourceSteps'],**manifest['stepCopies']}.items():
    body=(steps/name).read_bytes()
    if record!={'sha256':__import__('hashlib').sha256(body).hexdigest(),'bytes':len(body)}:
        raise SystemExit('local source/adapted workflow step hash or byte count differs: '+name)
for k,v in {'SOURCE_COMMIT':source['head'],'SOURCE_TREE':source['tree'],'WORKFLOW_SHA':source['workflowSha256'],'COHORT_LOCK_SHA':c['lockSha256'],'COHORT_PATH':str(cohort)}.items():
    print('export D5_'+k+'='+shlex.quote(v))
files=['run-d5-docker.sh','capture_docker.py','close_selected_evidence.py','prepare.py','adapt_local_identity.py','local-adapter-manifest.json','prepared-route.json','resource-profile.json','steps/initialize.sh','steps/replay.sh','steps/finalize.sh','steps/initialize.local.sh','steps/replay.local.sh','steps/finalize.local.sh']
roster={name:__import__('hashlib').sha256((root/name).read_bytes()).hexdigest() for name in files}
print('export D5_OPERATOR_HASHES='+shlex.quote(json.dumps(roster,sort_keys=True,separators=(',',':'))))
print('export D5_PROFILE_SHA='+shlex.quote(manifest['resourceProfileSha256']))
PY
)"

command -v docker >/dev/null || fail 'Docker CLI is unavailable'
mkdir -p "$OUT"
chmod 700 "$OUT"
EXECUTION_ID="local-$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
ATTEMPT=1
BRANCH="$(python3 - "$ROUTE" <<'PY'
import json,sys
print(json.load(open(sys.argv[1]))['source'].get('branch') or '')
PY
)"
if [[ -n "$BRANCH" ]]; then SOURCE_REF="local:refs/heads/$BRANCH"; else SOURCE_REF="local:detached:$D5_SOURCE_COMMIT"; fi
NETWORK="umf-d5-${EXECUTION_ID#local-}"
PG_NAME="$NETWORK-pg"
CLIENT_NAME="$NETWORK-client"

D5_CONFIG_ID=unknown
PG_CONFIG_ID=unknown
cleanup() {
  local original_status=$?
  local daemon_reachable=false client_absent=false postgres_absent=false network_absent=false
  if docker info >/dev/null 2>&1; then daemon_reachable=true; fi
  if [[ "$daemon_reachable" == true ]]; then
    local client_names='' postgres_names='' network_names=''
    if client_names=$(docker container ls -a --filter "name=^/${CLIENT_NAME}$" --format '{{.Names}}'); then
      if [[ "$client_names" == "$CLIENT_NAME" ]]; then docker rm -f "$CLIENT_NAME" >/dev/null 2>&1 || true
      elif [[ -n "$client_names" ]]; then client_names='LIST_ERROR'; fi
    else client_names='LIST_ERROR'; fi
    if postgres_names=$(docker container ls -a --filter "name=^/${PG_NAME}$" --format '{{.Names}}'); then
      if [[ "$postgres_names" == "$PG_NAME" ]]; then docker rm -f "$PG_NAME" >/dev/null 2>&1 || true
      elif [[ -n "$postgres_names" ]]; then postgres_names='LIST_ERROR'; fi
    else postgres_names='LIST_ERROR'; fi
    if network_names=$(docker network ls --filter "name=^${NETWORK}$" --format '{{.Name}}'); then
      if [[ "$network_names" == "$NETWORK" ]]; then docker network rm "$NETWORK" >/dev/null 2>&1 || true
      elif [[ -n "$network_names" ]]; then network_names='LIST_ERROR'; fi
    else network_names='LIST_ERROR'; fi
    if client_names=$(docker container ls -a --filter "name=^/${CLIENT_NAME}$" --format '{{.Names}}') && [[ -z "$client_names" ]]; then client_absent=true; fi
    if postgres_names=$(docker container ls -a --filter "name=^/${PG_NAME}$" --format '{{.Names}}') && [[ -z "$postgres_names" ]]; then postgres_absent=true; fi
    if network_names=$(docker network ls --filter "name=^${NETWORK}$" --format '{{.Name}}') && [[ -z "$network_names" ]]; then network_absent=true; fi
  fi
  local cleanup_ok=false
  if [[ "$daemon_reachable" == true && "$client_absent" == true && "$postgres_absent" == true && "$network_absent" == true ]]; then cleanup_ok=true; fi
  trap - EXIT INT TERM
  python3 - "$OUT/local-docker-context.json" "$EXECUTION_ID" "$ATTEMPT" "$D5_SOURCE_COMMIT" "$D5_SOURCE_TREE" "$D5_WORKFLOW_SHA" "$D5_IMAGE" "$D5_CONFIG_ID" "$PG_IMAGE" "$PG_CONFIG_ID" "$NETWORK" "$PG_NAME" "$CLIENT_NAME" "$daemon_reachable" "$client_absent" "$postgres_absent" "$network_absent" "$cleanup_ok" <<'PY'
import json,os,pathlib,sys,time
p,eid,attempt,commit,tree,workflow,d5image,d5config,pgimage,pgconfig,network,pgname,clientname,daemon_reachable,client_absent,pg_absent,network_absent,cleanup_ok=sys.argv[1:]
path=pathlib.Path(p)
record=json.loads(path.read_text()) if path.is_file() and not path.is_symlink() else {
 'profile':'umf.local-docker-g02-d5-context/1','resourceProfile':'LOCAL_EMULATED_3600','aggregateSeconds':3600,'executionKind':'local_linux_diagnostic',
 'hostedQualificationClaim':False,'executionId':eid,'attempt':int(attempt),
 'sourceCommit':commit,'sourceTree':tree,'workflowSha256':workflow,'operatorHashes':json.loads(os.environ['D5_OPERATOR_HASHES']),'resourceProfileSha256':os.environ['D5_PROFILE_SHA'],
 'runtimeImageReference':d5image,'runtimeImageConfigId':d5config,
 'postgresImageReference':pgimage,'postgresImageConfigId':pgconfig,
 'runtimeEngine':'OrbStack','host':{'os':'Darwin','architecture':'aarch64'},
 'guest':{'os':'Linux','distribution':'Ubuntu','version':'24.04.5','architecture':'x86_64','emulated':True},
 'clientExit':int(os.environ.get('D5_CLIENT_STATUS','1')),'outerCapture':{},'captureFailureCode':'outer-context-missing'}
record.update({'cleanup':{'daemonReachable':daemon_reachable=='true','clientContainer':clientname,'postgresContainer':pgname,'network':network,
 'clientAbsentAfterCleanup':client_absent=='true','postgresAbsentAfterCleanup':pg_absent=='true','networkAbsentAfterCleanup':network_absent=='true','verified':cleanup_ok=='true'},
 'cleanupRecordedAtEpochSeconds':int(time.time())})
path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps(record,sort_keys=True,indent=2)+'\n')
PY
  local close_status=0
  if python3 "$ROOT/close_selected_evidence.py" "$ROOT" "$OUT"; then close_status=0; else close_status=$?; fi
  if [[ "$original_status" -ne 0 ]]; then exit "$original_status"; fi
  if [[ "$cleanup_ok" != true || "$close_status" -ne 0 ]]; then
    printf 'D5 selected-evidence closure or owned-resource cleanup did not qualify\n' >&2
    exit 1
  fi
}
trap cleanup EXIT INT TERM

# Verify the exact preloaded images before creating the private network or any
# candidate container. The source volume is mounted read-only in every use.
for image in "$D5_IMAGE" "$PG_IMAGE"; do
  docker image inspect "$image" >/dev/null || fail "required preloaded image is missing: $image"
done
[[ "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$D5_IMAGE")" == linux/amd64 ]] || fail 'D5 runtime image is not Linux amd64'
[[ "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$PG_IMAGE")" == linux/arm64 ]] || fail 'PostgreSQL image is not Linux arm64'
D5_CONFIG_ID="$(docker image inspect --format '{{.Id}}' "$D5_IMAGE")"
PG_CONFIG_ID="$(docker image inspect --format '{{.Id}}' "$PG_IMAGE")"
[[ "$D5_CONFIG_ID" =~ ^sha256:[0-9a-f]{64}$ && "$PG_CONFIG_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'preloaded runtime image config identities are malformed'

# Read-only source-volume identity preflight; this invokes only Git metadata.
SOURCE_VOLUME_BRANCH="$(docker run --rm --pull=never --platform linux/amd64 \
  --network none \
  --mount "type=volume,src=$SOURCE_VOLUME,dst=/workspace,readonly" \
  -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/workspace \
  --entrypoint /bin/bash "$D5_IMAGE" -euo pipefail -c '
    cd /workspace
    test "$(git rev-parse HEAD)" = "$1"
    test "$(git rev-parse HEAD^{tree})" = "$2"
    status="$(git status --porcelain)"
    test -z "$status"
    test "$(sha256sum .github/workflows/access-boundaries.yml | cut -d" " -f1)" = "$3"
    git branch --show-current
  ' _ "$D5_SOURCE_COMMIT" "$D5_SOURCE_TREE" "$D5_WORKFLOW_SHA")"
[[ "$SOURCE_VOLUME_BRANCH" == "$BRANCH" ]] || fail 'read-only source volume branch differs from the prepared local source identity'
BRANCH="$SOURCE_VOLUME_BRANCH"

docker network create --internal --driver bridge "$NETWORK" >/dev/null
docker run -d --pull=never --platform linux/arm64 --name "$PG_NAME" \
  --network "$NETWORK" --network-alias postgres --cpus 2 --memory 2g --pids-limit 1024 \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$PG_IMAGE" >/dev/null

ready=0
for _ in $(seq 1 60); do
  if docker exec "$PG_NAME" pg_isready -U postgres -d postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || fail 'owned PostgreSQL 18.6 service did not become ready within 60 seconds'
PG_ID="$(docker inspect --format '{{.Id}}' "$PG_NAME")"
PG_PLATFORM="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$PG_IMAGE")"
PG_VERSION="$(docker exec "$PG_NAME" psql -U postgres -d postgres -At -c "select pg_catalog.version() || E'\n' || current_setting('server_version') || E'\n' || current_setting('server_version_num')")"
[[ "$PG_VERSION" == *"PostgreSQL 18.6"* && "$PG_VERSION" == *$'\n180006' ]] || fail 'owned PostgreSQL service identity is not exact 18.6 / 180006'
PG_QUIET_STATS="$(docker stats --no-stream --format '{{json .}}' "$PG_NAME")"
python3 - "$PG_NAME" "$PG_QUIET_STATS" <<'PY'
import json,sys
row=json.loads(sys.argv[2])
if type(row) is not dict or row.get('Name') != sys.argv[1]:
    raise SystemExit('owned PostgreSQL idle workload observation is malformed')
PY

mkdir -p "$OUT/d5-host"
chmod 700 "$OUT/d5-host"
cat > "$OUT/d5-host/run-inside.sh" <<'IN_CONTAINER'
#!/usr/bin/env bash
set -uo pipefail
cd /workspace
export D5_ROOT=/d5-host/d5
export PG_DSN="host=127.0.0.1 port=5432 dbname=postgres user=postgres application_name=umf_g02_d5_local connect_timeout=5 options='-c statement_timeout=120000 -c lock_timeout=5000'"
export LOCAL_EXECUTION_KIND=local_linux_diagnostic
export LOCAL_RESOURCE_PROFILE=LOCAL_EMULATED_3600
export LOCAL_RESOURCE_PROFILE_SHA="$D5_PROFILE_SHA"
export LOCAL_OPERATOR_HASHES="$D5_OPERATOR_HASHES"
export LOCAL_EXECUTION_ID="$D5_LOCAL_EXECUTION_ID"
export LOCAL_ATTEMPT="$D5_LOCAL_ATTEMPT"
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
IN_CONTAINER
chmod 700 "$OUT/d5-host/run-inside.sh"

set +e
python3 "$ROOT/capture_docker.py" "$OUT/outer-capture.json" "$OUT/outer.stdout.log" "$OUT/outer.stderr.log" -- timeout --signal=TERM --kill-after=10s 3600s docker run --pull=never --platform linux/amd64 --name "$CLIENT_NAME" \
  --network "container:$PG_NAME" --init --cpus 8 --memory 8g --pids-limit 4096 \
  --mount "type=volume,src=$SOURCE_VOLUME,dst=/workspace,readonly" \
  --mount "type=bind,src=$COHORT,dst=/tmp/umf-g02-cohort,readonly" \
  --mount "type=bind,src=$ROOT/steps,dst=/adapter/steps,readonly" \
  --mount "type=bind,src=$OUT/d5-host,dst=/d5-host" \
  -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/workspace \
  -e D5_LOCAL_EXECUTION_ID="$EXECUTION_ID" -e D5_LOCAL_ATTEMPT="$ATTEMPT" -e D5_SOURCE_COMMIT="$D5_SOURCE_COMMIT" \
  -e D5_SOURCE_REF="$SOURCE_REF" -e D5_SOURCE_BRANCH="$BRANCH" \
  -e D5_WORKFLOW_SHA="$D5_WORKFLOW_SHA" -e D5_IMAGE_ID="$D5_IMAGE" \
  -e D5_PROFILE_SHA="$D5_PROFILE_SHA" -e D5_OPERATOR_HASHES="$D5_OPERATOR_HASHES" \
  --entrypoint /bin/bash "$D5_IMAGE" -euo pipefail /d5-host/run-inside.sh
client_status=$?
set -e

CLIENT_LIMITS="$(docker inspect --format '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}} {{.HostConfig.PidsLimit}}' "$CLIENT_NAME" 2>/dev/null || printf unavailable)"
PG_LIMITS="$(docker inspect --format '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}} {{.HostConfig.PidsLimit}}' "$PG_NAME")"

python3 - "$OUT/local-docker-context.json" "$EXECUTION_ID" "$ATTEMPT" "$D5_SOURCE_COMMIT" "$D5_SOURCE_TREE" "$D5_WORKFLOW_SHA" "$D5_IMAGE" "$D5_CONFIG_ID" "$PG_IMAGE" "$PG_CONFIG_ID" "$PG_ID" "$PG_PLATFORM" "$PG_VERSION" "$client_status" "$CLIENT_LIMITS" "$PG_LIMITS" "$PG_QUIET_STATS" "$OUT/outer-capture.json" "$OUT" <<'PY'
import json,os,pathlib,sys,time
p,eid,attempt,commit,tree,workflow,d5image,d5config,pgimage,pgconfig,pgid,pgplatform,pgversion,rc,clientlimits,pglimits,quietstats,capture_path,output_root_arg=sys.argv[1:]
def limits(value):
    if value=='unavailable': return {'status':'container-not-inspectable-after-client-exit'}
    nano,memory,pids=value.split()
    return {'NanoCpus':int(nano),'memoryBytes':int(memory),'pidsLimit':int(pids)}
quiet=json.loads(quietstats)
capture=json.loads(pathlib.Path(capture_path).read_text())
output_root=pathlib.Path(output_root_arg).resolve()
child_log_dir=output_root/'d5-host'/'d5'/'evidence'/'logs'
child_log_bytes=sum(x.stat().st_size for x in child_log_dir.iterdir() if x.is_file() and not x.is_symlink()) if child_log_dir.is_dir() else 0
outer_log_bytes=capture['stdout']['storedBytes']+capture['stderr']['storedBytes']
raw_log_bytes=child_log_bytes+outer_log_bytes
path=pathlib.Path(p)
record={
 'profile':'umf.local-docker-g02-d5-context/1','resourceProfile':'LOCAL_EMULATED_3600','aggregateSeconds':3600,'executionKind':'local_linux_diagnostic',
 'hostedQualificationClaim':False,'executionId':eid,'attempt':int(attempt),
 'sourceCommit':commit,'sourceTree':tree,'workflowSha256':workflow,'operatorHashes':json.loads(os.environ['D5_OPERATOR_HASHES']),'resourceProfileSha256':os.environ['D5_PROFILE_SHA'],
 'resourceLimits':{'client':limits(clientlimits),'postgres':limits(pglimits)},
 'runtimeImageReference':d5image,'runtimeImageConfigId':d5config,
 'postgresImageReference':pgimage,'postgresImageConfigId':pgconfig,'postgresContainerId':pgid,
 'runtimeEngine':'OrbStack','host':{'os':'Darwin','architecture':'aarch64'},
 'guest':{'os':'Linux','distribution':'Ubuntu','version':'24.04.5','architecture':'x86_64','emulated':True},
 'postgresQuietWorkloadBeforeClient':quiet,
 'postgresPlatform':pgplatform,'postgresIdentityText':pgversion.splitlines(),
 'clientExit':int(rc),'captureFailureCode':('outer-capture-failed' if capture.get('captureFailed') else 'outer-capture-truncated' if capture['stdout']['truncated'] or capture['stderr']['truncated'] else None),'outerCapture':capture,'childRawLogBytes':child_log_bytes,'outerRawLogBytes':outer_log_bytes,'rawLogBytes':raw_log_bytes,'rawLogLimitBytes':1048576,'rawLogBudgetWithinLimit':raw_log_bytes<=1048576,'selectedMetadataLimitBytes':16777216,'cleanup':'pending-trap','recordedAtEpochSeconds':int(time.time())
}
path.write_text(json.dumps(record,sort_keys=True,indent=2)+'\n')
PY

if [[ "$client_status" -ne 0 ]]; then exit "$client_status"; fi

