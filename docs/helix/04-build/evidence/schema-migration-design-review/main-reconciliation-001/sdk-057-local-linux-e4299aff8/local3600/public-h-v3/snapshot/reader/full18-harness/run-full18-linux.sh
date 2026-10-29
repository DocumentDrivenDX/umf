#!/usr/bin/env bash
# Local runner for the existing full18 Linux acquisition and aggregate replay.
# This file only orchestrates repository-owned commands; it adds no verifier.
set -euo pipefail

if [[ $# == 3 && "$1" == --source-volume ]]; then
  SOURCE_MODE=volume
  SOURCE_VOLUME="$2"
  SOURCE_COMMIT="$3"
  [[ "$SOURCE_VOLUME" =~ ^[A-Za-z0-9_.-]+$ ]]
  SOURCE_MOUNT=(--mount "type=volume,src=$SOURCE_VOLUME,dst=/workspace,readonly")
elif [[ $# == 2 ]]; then
  SOURCE_MODE=bind
  SOURCE_ROOT="$(cd "$1" && pwd -P)"
  SOURCE_COMMIT="$2"
  SOURCE_MOUNT=(--mount "type=bind,src=$SOURCE_ROOT,dst=/workspace,readonly")
else
  echo "usage: $0 [--source-volume VOLUME | /absolute/path/to/final-clean-checkout] FINAL_SOURCE_COMMIT" >&2
  exit 64
fi
OUT_ROOT="${UMF_LOCAL_OUTPUT:-/private/tmp/migration-local-python-route/output}"
PY311_IMAGE='sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
PY314_IMAGE='sha256:2474bc9010faea57300e5e8c33a6be6fce4d37dada3bf8af7d8230069f4c0a30'

[[ "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]]
if [[ "$SOURCE_MODE" == bind ]]; then
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$SOURCE_COMMIT" ]]
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]]
fi
if [[ -d "$OUT_ROOT" ]] && [[ -n "$(find "$OUT_ROOT" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "Refusing to reuse nonempty output root: $OUT_ROOT" >&2
  exit 73
fi
mkdir -p "$OUT_ROOT"
OUT_ROOT="$(cd "$OUT_ROOT" && pwd -P)"
mkdir -p "$OUT_ROOT/cells/linux-x86_64-py311" \
  "$OUT_ROOT/cells/linux-x86_64-py314" \
  "$OUT_ROOT/aggregate-input" \
  "$OUT_ROOT/replay" "$OUT_ROOT/logs" "$OUT_ROOT/containers"

RUN_START_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RUN_START_TAG="$(date -u +%Y%m%dT%H%M%SZ)"
EXECUTION_ID="umf-local-full18-${RUN_START_TAG}-${BASHPID:-$$}-attempt1"
HARNESS_SHA256="$(shasum -a 256 "$0" | awk '{print $1}')"
PY311_ACTUAL_IMAGE_ID="$(docker image inspect "$PY311_IMAGE" --format='{{.Id}}')"
PY314_ACTUAL_IMAGE_ID="$(docker image inspect "$PY314_IMAGE" --format='{{.Id}}')"
{
  printf 'executionId=%s\n' "$EXECUTION_ID"
  printf 'attempt=1\n'
  printf 'sourceMode=%s\n' "$SOURCE_MODE"
  if [[ "$SOURCE_MODE" == volume ]]; then printf 'sourceVolume=%s\n' "$SOURCE_VOLUME"; fi
  printf 'sourceCommitRequested=%s\n' "$SOURCE_COMMIT"
  printf 'startedUtc=%s\n' "$RUN_START_UTC"
  printf 'harnessSha256=%s\n' "$HARNESS_SHA256"
  printf 'py311ImageId=%s\n' "$PY311_ACTUAL_IMAGE_ID"
  printf 'py314ImageId=%s\n' "$PY314_ACTUAL_IMAGE_ID"
  docker image inspect "$PY311_IMAGE" --format='py311RepoDigests={{json .RepoDigests}}'
  docker image inspect "$PY314_IMAGE" --format='py314RepoDigests={{json .RepoDigests}}'
} > "$OUT_ROOT/source-and-runtime.txt"
printf 'phase\tstate\tutc\n' > "$OUT_ROOT/phase-times.tsv"
phase_mark() { printf '%s\t%s\t%s\n' "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUT_ROOT/phase-times.tsv"; }
printf 'stage\tmaxSeconds\n' > "$OUT_ROOT/stage-timeouts.tsv"
printf 'stage\texitCode\tlogPath\tlogBytes\tlogSha256\n' > "$OUT_ROOT/stage-results.tsv"
record_stage() {
  local stage="$1" exit_code="$2" log="$3" bytes digest
  bytes="$(wc -c < "$log" | tr -d '[:space:]')"
  digest="$(shasum -a 256 "$log" | awk '{print $1}')"
  printf '%s\t%s\t%s\t%s\t%s\n' "$stage" "$exit_code" "${log#"$OUT_ROOT/"}" "$bytes" "$digest" >> "$OUT_ROOT/stage-results.tsv"
}
run_stage() {
  local stage="$1" maximum="$2" log="$3" pid elapsed status
  shift 3
  printf '%s\t%s\n' "$stage" "$maximum" >> "$OUT_ROOT/stage-timeouts.tsv"
  "$@" > "$log" 2>&1 &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    elapsed=$((SECONDS - stage_started))
    if (( elapsed >= maximum )); then
      docker stop --time 30 "umf-local-$stage" >/dev/null 2>&1 || true
      kill -TERM "$pid" 2>/dev/null || true
      set +e
      wait "$pid"
      set -e
      record_stage "$stage" 124 "$log"
      cat "$log"
      echo "Stage $stage reached its $maximum-second local maximum; output and logs are retained." >&2
      return 124
    fi
    sleep 1
  done
  set +e
  wait "$pid"
  status=$?
  set -e
  record_stage "$stage" "$status" "$log"
  cat "$log"
  return "$status"
}

docker_common=(--rm --pull=never --platform linux/amd64 --cpus 8 --memory 24g --pids-limit 8192
  --workdir /workspace
  --env GIT_CONFIG_COUNT=2
  --env GIT_CONFIG_KEY_0=safe.directory --env GIT_CONFIG_VALUE_0=/workspace
  --env GIT_CONFIG_KEY_1=safe.directory --env GIT_CONFIG_VALUE_1=/tmp/umf-source
  "${SOURCE_MOUNT[@]}")
offline_caps=(--network none --cap-add SYS_ADMIN --security-opt seccomp=unconfined)

SOURCE_IDENTITY="$(docker run --rm --pull=never --platform linux/amd64 --network none \
  --cpus 8 --memory 24g --pids-limit 8192 \
  --env GIT_CONFIG_COUNT=2 \
  --env GIT_CONFIG_KEY_0=safe.directory --env GIT_CONFIG_VALUE_0=/workspace \
  --env GIT_CONFIG_KEY_1=safe.directory --env GIT_CONFIG_VALUE_1=/tmp/umf-source \
  "${SOURCE_MOUNT[@]}" "$PY311_IMAGE" bash -euo pipefail -c '
    actual_head="$(git -C /workspace rev-parse HEAD)"
    actual_tree="$(git -C /workspace rev-parse "HEAD^{tree}")"
    test "$actual_head" = "$1"
    test -z "$(git -C /workspace status --porcelain)"
    printf "sourceActualCommit=%s\nsourceActualTree=%s\nsourceStatus=clean\nrunnerKernel=%s\n" \
      "$actual_head" "$actual_tree" "$(uname -srmo)"
  ' bash "$SOURCE_COMMIT")"
printf '%s\n' "$SOURCE_IDENTITY" >> "$OUT_ROOT/source-and-runtime.txt"

# The corpus command in the workflow follows a frozen Bun install. Use a
# writable disposable copy of the exact read-only checkout so node_modules
# never writes into the source mount; bind only the resulting corpus out.
phase_mark generator-corpus start
stage_started=$SECONDS
run_stage generator-corpus 1800 "$OUT_ROOT/logs/generator-corpus.log" \
  docker run --name umf-local-generator-corpus --stop-timeout 30 "${docker_common[@]}" --network bridge \
  --mount "type=bind,src=$OUT_ROOT,dst=/out" "$PY311_IMAGE" \
  bash -euo pipefail -c '
    test "$(git -C /workspace rev-parse HEAD)" = "$1"
    test -z "$(git -C /workspace status --porcelain)"
    mkdir -p /tmp/umf-source
    cp -a /workspace/. /tmp/umf-source/
    cd /tmp/umf-source
      test "$(git rev-parse HEAD)" = "$1"
      test -z "$(git status --porcelain)"
    bun install --frozen-lockfile
    bun scripts/codegen-corpus.ts /out/generator-corpus.json
    test "$(git rev-parse HEAD)" = "$1"
' bash "$SOURCE_COMMIT"
phase_mark generator-corpus finish

acquire_cell() {
  local cell="$1" py="$2" image="$3" cell_out="$OUT_ROOT/cells/$1"
  mkdir -p "$cell_out"
  phase_mark "$cell" start
  stage_started=$SECONDS
  run_stage "$cell-acquire" 3600 "$OUT_ROOT/logs/$cell.log" \
  docker run --name "umf-local-$cell-acquire" --stop-timeout 30 "${docker_common[@]}" --network bridge --cap-add SYS_ADMIN --security-opt seccomp=unconfined \
    --mount "type=bind,src=$cell_out,dst=/out" \
    --mount "type=bind,src=$OUT_ROOT,dst=/shared,readonly" "$image" \
    bash -euo pipefail -c '
      mkdir -p /tmp/umf-source
      cp -a /workspace/. /tmp/umf-source/
      cd /tmp/umf-source
      test "$(git rev-parse HEAD)" = "$1"
      test -z "$(git status --porcelain)"
      python -m pip install build==1.3.0 hatchling==1.27.0
      mkdir -p /tmp/mini-racer-wheelhouse
      python -m pip download --no-deps --only-binary=:all: \
        --dest /tmp/mini-racer-wheelhouse mini-racer==0.14.1
      python -I tests/codegen/verify_mini_racer_wheel.py \
        --wheelhouse /tmp/mini-racer-wheelhouse \
        --pins docs/helix/04-build/evidence/praxis-embedder/mini-racer-wheel-pins.json \
        --expected-platform linux-x86_64-glibc-2.27+
      python tests/codegen/acquire_offline_cohort.py \
        --output-dir /tmp/umf-full-cohort \
        --source-commit "$1" \
        --expected-os ubuntu-24.04 --expected-architecture x86_64 \
        --expected-python "$2" \
        --core-wheel-url https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.3/umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl \
        --core-wheel-filename umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl \
        --core-wheel-sha256 cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75 \
        --core-version 0.10.3 --core-release-tag python-v0.10.3 \
        --core-source-commit 7d334dec45948953718bfacd3ed6dd199cadba79 \
        --core-repository-url https://github.com/DocumentDrivenDX/umf \
        --core-sdist-url https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.3/umf_core-0.10.3.tar.gz \
        --core-sdist-sha256 61b3e12a84f68f890fa34e2da14bbda47e101b7c6eadd5207680827e8daa694c \
        --weft-wheel-url https://github.com/DocumentDrivenDX/weft/releases/download/v0.4.55/umf_weft-0.4.55-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl \
        --weft-wheel-filename umf_weft-0.4.55-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl \
        --weft-wheel-sha256 b34ca17fa37412afa7b8e8bd86aac8ee67a3c895a9b253221e1d582b39073a85 \
        --mini-racer-wheel /tmp/mini-racer-wheelhouse/*.whl
      cp /shared/generator-corpus.json /tmp/generator-corpus.json
      python -I tests/codegen/offline_mirror_probe.py \
        --wheelhouse /tmp/umf-full-cohort/wheelhouse \
        --lock /tmp/umf-full-cohort/cohort.lock.json \
        --mirror /tmp/umf-full-cohort/mirror \
        --generator-corpus /tmp/generator-corpus.json \
        --report /tmp/umf-full-cohort/offline-mirror-receipt.json
      cp -a /tmp/umf-full-cohort/. /out/
    ' bash "$SOURCE_COMMIT" "$py"
  cp "$OUT_ROOT/generator-corpus.json" "$cell_out/generator-corpus.json"
  phase_mark "$cell" finish
}

acquire_cell linux-x86_64-py311 3.11 "$PY311_IMAGE"
acquire_cell linux-x86_64-py314 3.14 "$PY314_IMAGE"

INPUT_ROOT="$OUT_ROOT/aggregate-input"
for cell in linux-x86_64-py311 linux-x86_64-py314; do
  mkdir -p "$INPUT_ROOT/$cell/wheelhouse"
  cp "$OUT_ROOT/cells/$cell/cohort.lock.json" "$INPUT_ROOT/$cell/"
  cp "$OUT_ROOT/cells/$cell/offline-mirror-receipt.json" "$INPUT_ROOT/$cell/"
  cp "$OUT_ROOT/cells/$cell/wheelhouse/"*.whl "$INPUT_ROOT/$cell/wheelhouse/"
done
cp "$OUT_ROOT/generator-corpus.json" "$OUT_ROOT/aggregate-input-generator-corpus.json"

# Mac inputs are collected on Linux as immutable bytes; they are not installed
# or executed. The existing assembler and selected-cell probes own validation.
phase_mark artifact-targets-and-assembly start
stage_started=$SECONDS
run_stage artifact-targets-and-assembly 1800 "$OUT_ROOT/logs/aggregate-assembly.log" \
  docker run --name umf-local-artifact-targets-and-assembly --stop-timeout 30 "${docker_common[@]}" --network bridge \
  --mount "type=bind,src=$INPUT_ROOT,dst=/aggregate-input" \
  --mount "type=bind,src=$OUT_ROOT,dst=/out" "$PY311_IMAGE" \
  bash -euo pipefail -c '
    python tests/codegen/acquire_offline_cohort.py \
      --output-dir /aggregate-input/artifact-targets/macos-arm64-py311 \
      --source-commit "$1" --artifact-target macos-arm64-py311 \
      --source-cohort-root /aggregate-input
    python tests/codegen/acquire_offline_cohort.py \
      --output-dir /aggregate-input/artifact-targets/macos-arm64-py314 \
      --source-commit "$1" --artifact-target macos-arm64-py314 \
      --source-cohort-root /aggregate-input
    python -I tests/codegen/aggregate_cohort.py assemble-linux-runtime-macos-inputs \
      --input-root /aggregate-input --output /out/aggregate \
      --source-commit "$1"
    cp /out/generator-corpus.json /out/aggregate/generator-corpus.json
  ' bash "$SOURCE_COMMIT"
phase_mark artifact-targets-and-assembly finish

# These receipts describe the actual local producer process and its bytes.
# They are separate from, and never written into, the frozen aggregate.
docker run --rm --interactive --pull=never --platform linux/amd64 --network none \
  --cpus 8 --memory 24g --pids-limit 8192 \
  --mount "type=bind,src=$OUT_ROOT,dst=/out" "$PY311_IMAGE" \
  python -I - <<'PY'
import csv, datetime, hashlib, json, pathlib, stat

root = pathlib.Path('/out')
receipt_path = root / 'local-aggregate-producer-receipt.json'
if receipt_path.exists():
    raise SystemExit('Refusing to replace an existing aggregate producer receipt')

def key_values(path):
    result = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            result[key] = value
    return result

def tsv(path):
    with path.open(encoding='utf-8', newline='') as stream:
        return list(csv.DictReader(stream, delimiter='\t'))

def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def file_ref(relative):
    path = root / relative
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise SystemExit(f'Expected a regular custody file: {relative}')
    return {'path': relative, 'bytes': info.st_size, 'sha256': sha(path)}

metadata = key_values(root / 'source-and-runtime.txt')
if metadata.get('sourceStatus') != 'clean' or metadata.get('sourceActualCommit') != metadata.get('sourceCommitRequested'):
    raise SystemExit('The Linux source identity receipt is absent or inconsistent')
stage_rows = tsv(root / 'stage-results.tsv')
assembly = next((row for row in stage_rows if row['stage'] == 'artifact-targets-and-assembly'), None)
if assembly is None or assembly['exitCode'] != '0':
    raise SystemExit('The aggregate assembly command has no successful captured exit')
phase_rows = tsv(root / 'phase-times.tsv')
phase = [row for row in phase_rows if row['phase'] == 'artifact-targets-and-assembly']
if [row['state'] for row in phase] != ['start', 'finish']:
    raise SystemExit('Aggregate assembly phase timestamps are incomplete')
files = {
    'aggregateIndex': file_ref('aggregate/aggregate.json'),
    'unionLock': file_ref('aggregate/union.lock.json'),
    'mirrorManifest': file_ref('aggregate/mirror/manifest.json'),
    'aggregateGeneratorCorpus': file_ref('aggregate/generator-corpus.json'),
    'sourceGeneratorCorpus': file_ref('generator-corpus.json'),
}
for cell in ('linux-x86_64-py311', 'linux-x86_64-py314'):
    files[f'{cell}SourceLock'] = file_ref(f'cells/{cell}/cohort.lock.json')
    files[f'{cell}SourceTemplate'] = file_ref(f'cells/{cell}/cohort-template.json')
    files[f'{cell}ProducerOfflineReceipt'] = file_ref(f'cells/{cell}/offline-mirror-receipt.json')
    files[f'{cell}AggregateLock'] = file_ref(f'aggregate/children/{cell}/cohort.lock.json')
    files[f'{cell}AggregateOfflineReceipt'] = file_ref(f'aggregate/children/{cell}/offline-mirror-receipt.json')
for target in ('macos-arm64-py311', 'macos-arm64-py314'):
    files[f'{target}Manifest'] = file_ref(f'aggregate/artifact-targets/{target}/artifact-target.json')
for wheel in sorted((root / 'aggregate/wheelhouse').glob('*.whl')):
    files[f'unionWheel:{wheel.name}'] = file_ref(wheel.relative_to(root).as_posix())
assembly_log = next((row for row in stage_rows if row['stage'] == 'artifact-targets-and-assembly'), None)
payload = {
    'profile': 'umf.local-linux-full18-aggregate-producer/1',
    'schema': 'umf.local-linux-full18-aggregate-producer/1',
    'status': 'assembled',
    'executionId': metadata['executionId'],
    'attempt': 1,
    'sourceCommit': metadata['sourceActualCommit'],
    'sourceTree': metadata['sourceActualTree'],
    'source': {'commit': metadata['sourceActualCommit'], 'tree': metadata['sourceActualTree'], 'status': 'clean'},
    'harness': {'path': 'run-full18-linux.sh', 'sha256': metadata['harnessSha256']},
    'runtimeImages': {
        'py311': {'imageId': metadata['py311ImageId'], 'repoDigests': json.loads(metadata['py311RepoDigests'])},
        'py314': {'imageId': metadata['py314ImageId'], 'repoDigests': json.loads(metadata['py314RepoDigests'])},
        'platform': 'linux/amd64', 'cpus': 8, 'memoryBytes': 25769803776, 'pidsLimit': 8192,
    },
    'runnerKernel': metadata['runnerKernel'],
    'command': {
        'name': 'assemble-linux-runtime-macos-inputs',
        'argv': ['python', '-I', 'tests/codegen/aggregate_cohort.py', 'assemble-linux-runtime-macos-inputs',
                 '--input-root', '/aggregate-input', '--output', '/out/aggregate',
                 '--source-commit', metadata['sourceActualCommit']],
        'exitCode': 0,
        'phase': {'startUtc': phase[0]['utc'], 'finishUtc': phase[1]['utc']},
        'log': {'path': assembly_log['logPath'], 'bytes': int(assembly_log['logBytes']),
                'sha256': assembly_log['logSha256']},
    },
    'phaseTimes': phase_rows,
    'stageResults': stage_rows,
    'stageMaximums': tsv(root / 'stage-timeouts.tsv'),
    'files': files,
    'generatedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
}
receipt_path.write_text(json.dumps(payload, sort_keys=True, indent=2) + '\n', encoding='utf-8')
PY

replay_cell() {
  local cell="$1" image="$2" report="$OUT_ROOT/replay/$1.json"
  phase_mark "$cell-union-replay" start
  stage_started=$SECONDS
  run_stage "$cell-union-replay" 3600 "$OUT_ROOT/logs/$cell-union-replay.log" \
  docker run --name "umf-local-$cell-union-replay" --stop-timeout 30 "${docker_common[@]}" "${offline_caps[@]}" \
    --mount "type=bind,src=$OUT_ROOT/aggregate,dst=/aggregate,readonly" \
    --mount "type=bind,src=$OUT_ROOT/replay,dst=/reports" \
    "$image" bash -euo pipefail -c '
      python -I tests/codegen/offline_mirror_probe.py \
        --aggregate-index /aggregate/aggregate.json \
        --selected-cell "$1" --expected-source-commit "$2" \
        --mirror /aggregate/mirror \
        --generator-corpus /aggregate/generator-corpus.json \
        --report "/reports/$1.json"
    ' bash "$cell" "$SOURCE_COMMIT"
  phase_mark "$cell-union-replay" finish
}

replay_cell linux-x86_64-py311 "$PY311_IMAGE"
replay_cell linux-x86_64-py314 "$PY314_IMAGE"
printf 'completedUtc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUT_ROOT/source-and-runtime.txt"

docker run --rm --interactive --pull=never --platform linux/amd64 --network none \
  --cpus 8 --memory 24g --pids-limit 8192 \
  --mount "type=bind,src=$OUT_ROOT,dst=/out" "$PY311_IMAGE" \
  python -I - <<'PY'
import csv, datetime, hashlib, json, pathlib, stat

root = pathlib.Path('/out')
assembly_path = root / 'local-aggregate-producer-receipt.json'
proof_path = root / 'local-full18-proof-receipt.json'
if proof_path.exists():
    raise SystemExit('Refusing to replace an existing full18 proof receipt')

def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def ref(relative):
    path = root / relative
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise SystemExit(f'Expected a regular proof file: {relative}')
    return {'path': relative, 'bytes': info.st_size, 'sha256': sha(path)}

with assembly_path.open(encoding='utf-8') as stream:
    assembly = json.load(stream)
with (root / 'stage-results.tsv').open(encoding='utf-8', newline='') as stream:
    stage_rows = list(csv.DictReader(stream, delimiter='\t'))
replay_stages = {f'{cell}-union-replay' for cell in ('linux-x86_64-py311', 'linux-x86_64-py314')}
selected = [row for row in stage_rows if row['stage'] in replay_stages]
if len(selected) != 2 or any(row['exitCode'] != '0' for row in selected):
    raise SystemExit('Both actual selected-cell union replay commands must have captured exit zero')
reports = {cell: ref(f'replay/{cell}.json') for cell in ('linux-x86_64-py311', 'linux-x86_64-py314')}
payload = {
    'profile': 'umf.local-linux-full18-union-proof/1',
    'schema': 'umf.local-linux-full18-union-proof/1',
    'status': 'passed',
    'executionId': assembly['executionId'],
    'attempt': assembly['attempt'],
    'sourceCommit': assembly['sourceCommit'],
    'sourceTree': assembly['sourceTree'],
    'source': assembly['source'],
    'harness': assembly['harness'],
    'runtimeImages': assembly['runtimeImages'],
    'runnerKernel': assembly['runnerKernel'],
    'assemblyReceipt': {'path': 'local-aggregate-producer-receipt.json',
                        'bytes': assembly_path.stat().st_size, 'sha256': sha(assembly_path)},
    'selectedCellReplayCommands': [
        {'stage': row['stage'], 'exitCode': int(row['exitCode']), 'logPath': row['logPath'],
         'logBytes': int(row['logBytes']), 'logSha256': row['logSha256']}
        for row in selected
    ],
    'unionReports': reports,
    'generatedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
}
proof_path.write_text(json.dumps(payload, sort_keys=True, indent=2) + '\n', encoding='utf-8')
PY
