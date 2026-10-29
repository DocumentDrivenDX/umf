#!/usr/bin/env bash
set -uo pipefail
CELL="$1"
cd /workspace || exit 90
mkdir -p /out/logs /out/reports /out/controls
record_cmd() {
  local label="$1"; shift
  local log="/out/logs/${CELL}-${label}${RUN_SUFFIX:-}.log"
  "$@" >"$log" 2>&1
  local status=$?
  local bytes sha
  bytes="$(wc -c <"$log" | tr -d ' ')"
  sha="$(sha256sum "$log" | awk '{print $1}')"
  printf '%s\t%s\t%s\t%s\t%s\n' "$label" "$status" "$bytes" "$sha" "$log" >> /out/command-records.tsv
  printf '%s exit=%s bytes=%s sha256=%s\n' "$CELL/$label" "$status" "$bytes" "$sha"
  return "$status"
}
if [[ "$CELL" == linux-x86_64-py311 ]]; then PY=python3.11; else PY=python3.14; fi
printf 'cell=%s\n' "$CELL" > /out/identity.txt
printf 'dateUtc=' >> /out/identity.txt; date -u +%Y-%m-%dT%H:%M:%SZ >> /out/identity.txt
printf 'sourceCommit=' >> /out/identity.txt; git -c safe.directory=/workspace rev-parse HEAD >> /out/identity.txt
printf 'sourceTree=' >> /out/identity.txt; git -c safe.directory=/workspace rev-parse 'HEAD^{tree}' >> /out/identity.txt
printf 'sourceStatus=' >> /out/identity.txt; if [[ -z "$(git -c safe.directory=/workspace status --porcelain)" ]]; then echo clean >> /out/identity.txt; else git -c safe.directory=/workspace status --porcelain >> /out/identity.txt; exit 91; fi
printf 'python=' >> /out/identity.txt; "$PY" --version >> /out/identity.txt 2>&1
record_cmd packaging-bootstrap-install "$PY" -I -m pip --isolated install --disable-pip-version-check --no-index --no-deps --ignore-installed /bootstrap/packaging-26.3-py3-none-any.whl || exit $?
"$PY" -I - <<'PY' "$CELL"
import hashlib, importlib.metadata, json, pathlib, sys
from packaging.markers import default_environment
cell=sys.argv[1]
aggregate=json.loads(pathlib.Path('/aggregate/aggregate.json').read_text())
rows=aggregate.get('runtimeCells', aggregate.get('cells'))
row=next(item for item in rows if item['id']==cell)
lock=json.loads((pathlib.Path('/aggregate')/next(p['path'] for p in [row['lock']])).read_text())
wheel=pathlib.Path('/bootstrap/packaging-26.3-py3-none-any.whl')
actual=default_environment()
expected=lock.get('dependencyResolution',{}).get('markerEnvironment')
origin=pathlib.Path(__import__('packaging').__file__).resolve()
proof={
 'cell':cell,
 'pythonVersion':sys.version,
 'packagingVersion':importlib.metadata.version('packaging'),
 'packagingImportOrigin':str(origin),
 'bootstrapWheel':wheel.name,
 'bootstrapWheelSha256':hashlib.sha256(wheel.read_bytes()).hexdigest(),
 'bootstrapWheelBytes':wheel.stat().st_size,
 'actualDefaultEnvironment':actual,
 'acquisitionDefaultEnvironment':expected,
 'defaultEnvironmentEqual':actual==expected,
}
pathlib.Path('/out/bootstrap-proof.json').write_text(json.dumps(proof,sort_keys=True,indent=2)+'\n')
print(json.dumps({k:proof[k] for k in ('cell','packagingVersion','packagingImportOrigin','bootstrapWheelSha256','bootstrapWheelBytes','defaultEnvironmentEqual')},sort_keys=True))
if proof['packagingVersion']!='26.3' or not proof['defaultEnvironmentEqual']:
 raise SystemExit('packaging bootstrap or acquisition environment proof failed')
PY
status=$?; [[ $status -eq 0 ]] || exit "$status"
record_cmd selector-control "$PY" -I tests/codegen/test_cohort_selector.py InventoryTests.test_active_requirement_extras_refuse_but_inactive_optional_edge_stays_inactive || exit $?
record_cmd union-replay "$PY" -I tests/codegen/offline_mirror_probe.py --aggregate-index /aggregate/aggregate.json --selected-cell "$CELL" --expected-source-commit e4299aff8e87e9d211f9d86df2f2013ab9c95945 --mirror /aggregate/mirror --generator-corpus /aggregate/generator-corpus.json --report "/out/reports/${CELL}.json"
exit $?
