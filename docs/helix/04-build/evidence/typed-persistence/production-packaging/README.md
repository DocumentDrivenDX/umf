# Local production-runtime packaging preparation

The production package metadata is `python/umf_access/pyproject.toml`. Its local
prerelease is `umf_access==0.1.0.dev0`, with Python execution pinned to 3.14.8 and
Pydantic 2.14.1. It declares no driver extras and is not a publication. Release
location/cadence remain owner decisions. The exact profile is
`python/umf_access/compatibility-profile.json`; checker language target 3.12 does
not establish execution support on 3.12.

## Current evidence

Eight harness-control tests pass. The actual runtime wheel builds, includes
`py.typed`, excludes tests/evidence/host helpers, and matches its captured source
bytes. The retained wheel under `artifacts/` and emitted actual-generator probe
under `generated-probe/` are pinned by verification.json and build.json.

The earlier validate_constraints refusal is retained: it named a superseded
experimental helper. The profile now checks the agreed real scalar and
length/range/allowed helpers. The current actual-generated Order fixture imports
against the installed production wheel and passes mypy. Strict pyright refuses
six real emitter diagnostics: one unnecessary datetime/None comparison in
codecs.py and five private validator imports in keys.py. No diagnostic is hidden. This preparation does not
close STP-080/081/082, B-TP-004 or any native target. Source changes require a new
build and replay; an old wheel qualifies only its recorded source tuple.

## API and ownership handoff

The parent owns `umf_access.__init__`; it supplies public
`RUNTIME_ABI = "umf-access-runtime/0.1"` and real-source exports. Model/DSL owners
retain their source ownership. Packaging checks required imports from the current
production generator ABI: StrictModel, scalar validators and
validate_length/validate_range/validate_allowed, revalidation/inventory helpers, and the DSL constructors.
`scope.json` lists the packaging session's exact owned paths.

Build and replay helpers live in `tests/packaging/`, excluded by the existing
runtime boundary checker and wheel package selection. They perform host I/O;
the installed runtime has no dependency on them. No __init__.py or model/DSL
source is edited by this session.

## Commands

Run from the shared repository with Python from the isolated compatibility
environment. First install the exact buildDependencies and checkers in the profile
into a build environment. The runtime replay creates its own clean venv; it
never installs over the compatibility spike runtime.

```
/private/tmp/umf-tp001-compat-env/bin/python -B -m unittest discover -s python/umf_access/tests -p test_wheel_contract.py
bun python/umf_access/tests/packaging/emit_replay_fixture.ts /private/tmp/umf-access-production-generated
/private/tmp/umf-tp001-compat-env/bin/python -B python/umf_access/tests/packaging/build_wheel.py --out-dir /private/tmp/umf-access-production-wheels --report /private/tmp/umf-access-production-build.json
```

Continue only after a successful build. Its report must be passed to replay;
a refused build or different wheel hash is rejected before installation.

```
UV_CACHE_DIR=/private/tmp/umf-tp001-uv-cache /private/tmp/umf-tp001-compat-env/bin/python -B python/umf_access/tests/packaging/replay_installed.py \
  --wheel /private/tmp/umf-access-production-wheels/umf_access-0.1.0.dev0-py3-none-any.whl \
  --build-report /private/tmp/umf-access-production-build.json \
  --manifest /private/tmp/umf-access-production-generated/shop/_umf/manifest.json \
  --generated-root /private/tmp/umf-access-production-generated --package shop \
  --profile python/umf_access/compatibility-profile.json \
  --checker-python /private/tmp/umf-tp001-compat-env/bin/python \
  --report /private/tmp/umf-access-production-installed-replay.json
```

Installation is offline from the populated uv cache. Missing cached dependencies
refuse without network fallback. Actual import runs with `-I -B`, no ambient
PYTHONPATH/PYTHONHOME and no development runtime path. It compares every installed
wheel member (except installer-rewritten RECORD), detects added code, verifies
public ABI and every exact generated-manifest pin, and checks emitted file hashes.
It then runs both pinned checkers against actual generated source with the
installed runtime interpreter. Import failure prevents static acceptance.

## Import I/O qualification

The audit refuses network/process operations, file writes and arbitrary
non-module file reads. It explicitly records CPython's macOS SystemVersion.plist
read during zoneinfo/sysconfig initialization and isolated installed-distribution
METADATA/entry_points.txt reads used by Pydantic's loader. These are narrowly
scoped observed module-loader metadata reads, not a blanket cold-import
zero-I/O claim. They do not establish STP-081's full isolated-import acceptance.

## Retained attempts

The initial test-first run failed because the replay helper did not exist.
Attempt1 refused concurrent runtime-source edits during build. Its follow-on
probe was not acceptance and exposed the need for a required passing build report.
Attempt2 retained the CPython SystemVersion.plist refusal; attempt3 retained
Pydantic entry-point metadata discovery. Attempts4/5 retain the superseded validate_constraints export refusal. The
current profile follows the agreed current helper ABI and reaches the six strict
pyright emitter diagnostics. Earlier failures are retained independently.

## Latest independent installed snapshot

`latest-installed-snapshot.json` points to the exact wheel/interpreter and source
manifest for independent model/DSL replay. The e4c780c7 snapshot passes all 50
installed DSL/capture/render tests and generated mypy; strict generated pyright
retains six emitter diagnostics. It supersedes the older ActionRef id/action
mismatch snapshot for those tests. All claims remain tied to captured bytes.

## Stable runtime-only checkpoint

Use `latest-runtime-snapshot.json` for the newly authorized stable runtime and
`stable-runtime-checkpoint.json` for the installed 56-test replay and exact source
manifest. The interpreter is
`/private/tmp/umf-access-runtime-9189ac065cbe51b4/bin/python`.
This runtime snapshot has no generated package attached. The older
`latest-installed-snapshot.json` remains the historical e4 combined snapshot;
its generated/static results do not transfer to the new runtime.

`tests/packaging/snapshot_runtime.py` freezes a passing build into
`snapshots/runtime/<wheelSHA>/` and refuses replacement. Reuse the installed
runtime for generator-only changes. For generated evidence,
`generated_snapshot_identity` hashes the exact wheel SHA, generator-source digest
and generation input digest; `reserve_generated_snapshot` creates a separate
`snapshots/generated/<compositeSHA>/` directory and refuses overwrites. Both the
same-identity refusal and independent change of each identity input are tested.
The generated positive and stage-two callsite gates remain UNTESTED on this new
runtime until the governed full-commerce fixture and emitter fixes are ready.
