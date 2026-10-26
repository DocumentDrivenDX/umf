---
ddx:
  id: umf.evidence.rust-migration.r8-python-release-readiness
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-coordinated-release
      kind: extends
    - id: umf.evidence.rust-migration.r8-python-v8-closure-audit
      kind: informed_by
---

# R8 Python release readiness — 2026-10-25

The initial sections below record a local environment and source-route audit.
The later section “Local installed-artifact qualification” adds nonpublishing
CPython 3.12/3.13 package qualification; neither section dispatches hosted jobs
or publishes artifacts. The inspected checkout is branch `codex/rust-full-port`, HEAD
`0b34ae07f750ae4dbce20cc926bccaaf47f4f119`; the worktree was already dirty, so
this packet does not establish a source-frozen cohort.

## Six hosted cohorts and local availability

`.github/workflows/python-coordinated-release.yml` defines exactly these
matrix entries, with pinned Rust 1.90.0:

| Cohort | Hosted runner | CPython | Local assessment |
|---|---|---:|---|
| `linux-x86_64-cpython-311` | `ubuntu-24.04`, x64 | 3.11.17 | Cannot reproduce locally: host is macOS arm64. |
| `linux-x86_64-cpython-312` | `ubuntu-24.04`, x64 | 3.12.15 | Cannot reproduce locally: host is macOS arm64. |
| `linux-x86_64-cpython-313` | `ubuntu-24.04`, x64 | 3.13.16 | Cannot reproduce locally: host is macOS arm64. |
| `macos-arm64-cpython-311` | `macos-15`, arm64 | 3.11.17 | Interpreter matches; Twine dependency closure remains incomplete offline. |
| `macos-arm64-cpython-312` | `macos-15`, arm64 | 3.12.15 | Local package qualification completed on Darwin 27 arm64; hosted OS image differs. |
| `macos-arm64-cpython-313` | `macos-15`, arm64 | 3.13.16 | Local package qualification completed on Darwin 27 arm64; hosted OS image differs. |

The local host reports macOS `Darwin-27.0.1-arm64-arm-64bit`. Exact CPython
3.11.17, 3.12.15, and 3.13.16 interpreters are installed as arm64 builds.
Rust/cargo 1.90.0 are installed in the Rust toolchain directory but are not on
this shell's `PATH`; adding
`/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin` makes them
available. Bun 1.4.3 and Node 26.12.1 are installed but are not required by the
Python release workflow.

**Count:** three of six cohorts have the local OS/architecture and exact Python
interpreter. The local dependency stack is complete for the CPython 3.12 and
3.13 macOS-arm64 environments, but incomplete for CPython 3.11; the local OS
image is Darwin 27 rather than hosted `macos-15`. Linux is not locally
reproducible. The initial audit made no package qualification claim; see the
local CPython 3.12/3.13 results below.

### Offline dependency environment check

The reusable R8 wheelhouse at
`/private/tmp/umf-r8-python-closure-20261025/wheelhouse` contains
`build==1.3.0`, `hatchling==1.27.0`, `pydantic==2.11.9`, `pydantic-core==2.33.2`
for CPython 3.11, and the pure-Python dependencies `packaging==26.3`,
`pyproject-hooks==1.3.3`, `pathspec==1.1.1`, `pluggy==1.7.0`,
`trove-classifiers==2026.9.21.13`, `typing-extensions==4.16.0`,
`typing-inspection==0.4.4`, and `annotated-types==0.8.0`. Isolated environments
are at `/private/tmp/umf-r8-python-release-readiness-20261025/envs/cpython-3.11`,
`/private/tmp/umf-r8-python-release-readiness-20261025/envs/cpython-3.12`, and
`/private/tmp/umf-r8-python-release-readiness-20261025/envs/cpython-3.13`.

All three environments now import/check `build==1.3.0`, `hatchling==1.27.0`,
`pytest==8.4.2`, and `pydantic==2.11.9` / `pydantic-core==2.33.2`; `pip check`
reports no broken installed requirements. Pytest and Twine were installed
offline from the existing uv package cache. CPython 3.12 and 3.13 also import
`twine==6.2.0`, and `python -m twine --version` passes in both environments.
Their compatible `pydantic-core` wheels were absent from the R8 wheelhouse;
they were reconstructed under
`/private/tmp/umf-r8-python-release-readiness-20261025/reconstructed-wheels`
from uv's extracted cache entries after verifying each of the nine `RECORD`
entries. The resulting SHA-256 values are `2ad1c532b5e9260ef95529946d61e3e7912df1217c8f6ff3f0800aa4673ca7c4`
for CPython 3.12 and `5d86165d744799d438c7e804266aabd0ec3dc394640f388ef20de61eca9f3999`
for CPython 3.13. These are reconstructed local cache wheels, not source-built
or release artifacts.

CPython 3.11 remains unable to install the workflow's Twine pin offline. The
uv cache has Twine 6.2.0 and Keyring 25.7.0, but Keyring's dependency
`jaraco-context==6.1.2` requires `backports-tarfile` on Python below 3.12; the
cache has only its package metadata, not an installable wheel. No older cached
Keyring wheel satisfies Twine's `keyring>=21.2.0` marker. A locally
reconstructed `importlib-metadata==9.0.1` plus `zipp==4.1.1` wheel did not close
that dependency chain. `twine` is therefore absent from the CPython 3.11
environment. The earlier wheelhouse-only resolution logs in
`/private/tmp/umf-r8-python-release-readiness-20261025/resolution/` predate
the uv-cache installs and should be read as initial failed attempts; the
environment state above is the final self-check.

At the time of this dependency-only audit, it qualified offline dependency
installation/imports only. Environment and reconstructed-wheel writes were
confined to `/private/tmp`; the source worktree was not used as input for that
check. The subsequent package qualification used the present source checkout,
with artifacts and Cargo targets under `/private/tmp`.

## Existing nonpublishing gate and trigger

The workflow builds both `umf-core` 0.11.0 and `umf-codegen` 0.2.0 wheels and
sdists for every cohort; runs `twine check`; verifies the core wheel payload and
offline extracted-sdist rebuild; verifies the coordinated installed pair and
codegen sdist rebuild; and runs the selected codegen/core tests against the
installed wheels. A dependent job tests both receipt verifiers and accepts
exactly six cohort receipts bound to the same source revision and workflow run.
The workflow has `contents: read` and uploads qualification artifacts only;
there is no package-publish step. The standalone PyPI publisher remains a
separate fail-closed workflow.

Once `codex/rust-full-port` is pushed and ready for a qualification run, either
select **Actions → Coordinated Python release validation → Run workflow** and
choose that branch, or run:

```sh
gh workflow run python-coordinated-release.yml --ref codex/rust-full-port
```

The workflow also runs for pull requests matching its declared source/build
paths. No hosted run was dispatched for this audit; coordinate with Sol before
triggering it. A passing matrix is still qualification evidence, not
publication authorization.

Workflow SHA-256 at inspection: `ba8f26ce011cbcbca5546951c475780d50a3759ff51b74efe92c1ee3083381ba`.
The exact local interpreter/platform and dependency probe was read-only.

## Python API/runtime boundary and closure blockers

The Python package paths inspected are `python/src/umf/`,
`python/umf_codegen/src/umf_codegen/`, and `python/umf_access/src/umf_access/`.
A focused search of their Python sources found no Node/V8/JavaScript runtime
loader or invocation; the only V8 match was `_native.py`'s descriptive
“V8-free” docstring. This is source evidence, not proof over installed
artifacts or all transitive dependencies.

- `umf-core` exposes Python models and adapters in `python/src/umf/__init__.py`
and imports the required PyO3 extension through `python/src/umf/_rust.py`.
The package fails closed when `_rust_core` is absent. Its wheel hook builds the
Rust extension (`abi3-py311`) and bundled `umf` CLI. Python still owns public
models, host JSON/wire conversion, resource bridging, and API composition.
- `umf_codegen` exposes a Python API and CLI. Its `_native.py` validates the
installed core/resources and launches only the bundled `umf/_bin/umf` via
`subprocess.Popen`; semantic compile/verify operations dispatch to Rust while
Python retains process, protocol, timeout, and filesystem handling.
- `umf_access` has selected Rust-backed custody/rendering, related-key parsing,
and outcome-value crypto paths. Lifecycle, query DSL, PostgreSQL integration,
coordination, and CLI host behavior remain materially Python-owned. The older
source audit identifies these as boundary questions, not automatic port
requirements; resolve their contract/supported-surface status before a full
Rust-ownership claim.

The current R8 gap ledger (`gap-ledger.json`, SHA-256
`035ce31bd7f69a2834f6434322a1a8115207b11289aeb6ca20b09ddd4f91671e`) counts
922 logical executable default Node/browser declarations still open for
retirement, with 864 lacking an accepted Rust mapping and five logical routes
having bounded private installed binding evidence. These figures describe the
TypeScript Node/browser roots, not Python API counts and not a direct blocker to
building the Python pair. They do show that a coordinated Python wheel matrix
cannot be represented as complete shared-SDK Rust API closure.

A prior source-current private capture,
[`current-source-installed-20261025.md`](../r8-python-v8-closure-audit/current-source-installed-20261025.md),
built all three Python distributions and replayed installed imports/generation/
CLI checks on macOS arm64 CPython 3.11.17. It explicitly covers only one host
and not every Python API or the six-cohort matrix. It used HEAD
`10aa5c41bf8825eed446bc0af9735853cf0b304b` plus captured worktree files, not
this packet's HEAD or dirty source. Its artifact hashes must not be treated as
receipts for the current checkout.

## Remaining gate sequence

1. Freeze the intended source and refresh the source-bound package/resource and
   metamodel checks; this local run used a dirty checkout and is not final
   release evidence.
2. Complete the missing CPython 3.11 offline Twine dependency closure only if
   another local run is needed; the hosted runner installs its pinned tools.
3. Push the frozen branch and, after coordination with Sol, run the
   nonpublishing matrix and verify its aggregate contains all six receipts for
   that exact revision/run. The local CPython 3.12/3.13 checks do not replace
   the hosted macOS 15 or Linux cohorts.
4. Keep delivery review, publication, registry-byte checks, clean-install
   verification, and rollback pins as separate release decisions/gates.

The inspection hashes the workflow and ledger above; it does not modify
production, generated outputs, workflow, ledger, archive, or package files.

## Local installed-artifact qualification: CPython 3.12 and 3.13 — 2026-10-25

This extends the dependency-only readiness audit above. It is a nonpublishing,
local macOS arm64 run against the dirty checkout at HEAD
`0b34ae07f750ae4dbce20cc926bccaaf47f4f119` (`codex/rust-full-port`). It does
not qualify the six hosted cohorts, a clean frozen release revision, or Linux.
The core artifact verifier bound both runs to the same 936-file sdist build
input closure SHA-256 `a6973c80127c04e0c3fb01e6e41d9ae88f38b2085cb5c91427d160b182a1850e`;
the codegen packaged resource manifest SHA-256 was
`023a427e4b737f1e58238bc49d8b55bc990f95fe1707044b1901dacfd0445365`.

### Environment and commands

Both isolated environments already described above were used:
`/private/tmp/umf-r8-python-release-readiness-20261025/envs/cpython-3.12`
and `.../envs/cpython-3.13`. They reported CPython 3.12.15 and 3.13.16,
`build==1.3.0`, `hatchling==1.27.0`, `twine==6.2.0`, `pytest==8.4.2`, and
`pydantic==2.11.9`. Rust and Cargo 1.90.0 were selected from
`/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin`. All Cargo
builds used `CARGO_NET_OFFLINE=true` and a distinct target directory under
`/private/tmp/umf-r8-python-release-qualification-20261025/cpython-{3.12,3.13}`.
Artifacts and logs are in the same temporary directory; build outputs were
sent to explicit `--outdir` directories there.

For each interpreter, the source build commands were:

```sh
python -m build --no-isolation --wheel --sdist --outdir "$TMP/artifacts/core" python
python -m build --no-isolation --wheel --sdist --outdir "$TMP/artifacts/codegen" python/umf_codegen
python -m twine check "$TMP/artifacts/core"/* "$TMP/artifacts/codegen"/*
python tools/verify_python_artifacts.py \
  --wheel "$TMP/artifacts/core/umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl" \
  --sdist "$TMP/artifacts/core/umf_core-0.11.0.tar.gz" \
  --rebuilt-wheel-directory "$TMP/core-sdist-rebuilt" \
  --repository . --expected-platform macos_arm64 \
  --receipt "$TMP/core-artifact-receipt.json"
PIP_NO_INDEX=1 PIP_FIND_LINKS="/private/tmp/umf-r8-python-closure-20261025/wheelhouse /private/tmp/umf-r8-python-release-readiness-20261025/reconstructed-wheels" \
  python tools/verify_python_release_pair.py \
  --repository . --artifacts "$TMP/artifacts/pair" \
  --core-receipt "$TMP/core-artifact-receipt.json" \
  --receipt "$TMP/coordinated-release-receipt.json"
```

`$TMP` above denotes the interpreter-specific directory. The first pair-verifier
attempt without `PIP_NO_INDEX` failed when its temporary venv tried reaching
PyPI; networking was unavailable. Re-running with the local wheelhouse and
reconstructed CPython-compatible wheels passed. This is a local offline
adaptation of the workflow verifier, not a hosted invocation.

After installing the four artifacts into each existing isolated qualification
environment with `python -m pip install --no-index --no-deps <core-wheel>
<codegen-wheel>`, the workflow-selected test command was run from `/private/tmp`:

```sh
python -I -B -m pytest -q \
  /Users/erik/.codex/worktrees/rust-binding-spike/umf/python/umf_codegen/tests \
  /Users/erik/.codex/worktrees/rust-binding-spike/umf/python/tests/test_core.py \
  /Users/erik/.codex/worktrees/rust-binding-spike/umf/python/tests/test_rust_core.py
```

The installed-artifact tests passed **217 tests** on each interpreter (3.12:
59.53s; 3.13: 63.48s). Pytest emitted one cache warning because it could not
write `python/.pytest_cache` in this worktree; test results were successful.
The test environment was the isolated pre-provisioned build/test environment,
not a fresh empty venv, because the offline cache did not contain an installable
pytest wheel for a new venv. The pair verifier itself did create a fresh venv;
its pydantic install used local `PIP_FIND_LINKS` and completed successfully.

### CPython 3.11 offline follow-up — 2026-10-26

The CPython 3.11.17 arm64 environment at
`/private/tmp/umf-r8-python-release-readiness-20261025/envs/cpython-3.11`
passed `pip check` and imports/version checks for build 1.3.0, hatchling 1.27.0,
pytest 8.4.2, pydantic 2.11.9, and pydantic-core 2.33.2. The release verifier
unit tests passed 24/24 under that interpreter:

```sh
python -m pytest -q \
  python/tests/test_coordinated_python_release.py \
  python/tests/test_python_release_matrix.py
```

The pinned Twine 6.2.0 code and dependencies do exist in the shared uv cache,
but the CPython 3.11 environment still lacks an installable offline wheel
closure because `backports-tarfile` is missing. For a compatibility probe,
CPython 3.11 imported the cached Twine 6.2.0 runtime and ran `twine check` on
all four artifacts using the CPython 3.12 environment's pure-Python package
path at
`/private/tmp/umf-r8-python-release-readiness-20261025/envs/cpython-3.12/lib/python3.12/site-packages`.
All four checks passed. This demonstrates that Twine 6.2.0 executes under
CPython 3.11, but it does not repair or qualify a self-contained CPython 3.11
dependency installation.

Nonpublishing CPython 3.11 core and codegen wheel/sdist builds were attempted
with the isolated environment, Rust/Cargo 1.90.0, and `CARGO_NET_OFFLINE=true`.
The core wheel used the expected `cp311-abi3-macosx_11_0_arm64` tag, and
`twine check` passed for the four outputs. `tools/verify_python_artifacts.py`
then rejected the sdist with `sdist-source-bytes-differ`; Schema Properties
source was being edited concurrently during this build. Treat these outputs as
an interrupted source-cohort attempt, not qualification evidence. No further
source-bound package builds should run until a single frozen source closure is
captured. The hosted six-cohort workflow already installs Twine online and is
unaffected by this local cache gap.

### Results and artifact digests

`twine check` passed all four artifacts per interpreter. For both versions, the
core verifier reported `source_payload_verification=passed`, extracted-sdist
rebuild `non_native_package_payload_matches=true`, `metadata_byte_identity=true`,
`tag_matches=true`, `version_matches=true`, and `wheel_byte_identity=true`.
The verifier's recorded native rebuild byte identity was false for the CLI and
extension binaries; this did not fail its contract, which checks native platform
identity and non-native/source payload equality. The pair verifier reported
installed import/generation smoke and installed CLI help passed, plus
byte-identical codegen wheel rebuilt from its sdist.

| Artifact | CPython 3.12 SHA-256 | CPython 3.13 SHA-256 |
|---|---|---|
| Core wheel `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `cd0827963d01a151714b9534f9ca6f5bf2fa2e177bb502043d314858f97e1790` | `fea529c5ef2ad64e0c3deacde504a78b63dc8deac962f2bc6f504fc363a75f1f` |
| Core sdist `umf_core-0.11.0.tar.gz` | `3ad58d3fd44f738fc1df24b4968b9ab93c7da78052b9aa870262b75dbb0eeb22` | same |
| Codegen wheel `umf_codegen-0.2.0-py3-none-any.whl` | `3e785612512a8a40d70b67c6839e85d2e1a236435500714d806dba93750b0011` | same |
| Codegen sdist `umf_codegen-0.2.0.tar.gz` | `830091ad281a9a48ee7832021d1c4f8051fb196e50e7e1faf1bb3a1931f99055` | same |

The full verifier receipts are in `local-receipts/`; their SHA-256 values are
listed here:

| Receipt | SHA-256 |
|---|---|
| `local-receipts/cpython-3.12-core-artifact-receipt.json` | `eb2d5c8883d564aad492a1979e455cd4965b7f4a4f0d1d25084e58951ba94fd9` |
| `local-receipts/cpython-3.12-coordinated-release-receipt.json` | `d7752d3865fb7e7d1d59c9a82157b854bf61fbc5b7657240dda425aee62384a5` |
| `local-receipts/cpython-3.13-core-artifact-receipt.json` | `3b9f8687deb8fd0d76cc62e56c9a9d09096fb46b09503d3afc44589f0c7eecc2` |
| `local-receipts/cpython-3.13-coordinated-release-receipt.json` | `76b3950172ea2cca243fc89a150731e3dae1892296373b4f09fff8ab47bde83e` |

### Limits and remaining gate

This qualifies two local macOS-arm64 interpreter runs only; macOS 27 differs
from hosted `macos-15`, and the Linux x86_64 cohorts remain untested. The
workflow's aggregate six-receipt verifier was not run because only two cohorts
were produced. There was no tag, publication, hosted dispatch, or clean-source
release approval. CPython 3.11 is not included in this package qualification:
its pinned Twine dependency closure remains incomplete offline. Freeze the
source, then run the complete hosted matrix to establish all six exact runner
cohorts and aggregate receipts before treating this package release gate as
complete.

### Current-source release-verifier tests — 2026-10-26

The four offline release-verifier test modules pass **75/75** on each local
CPython 3.11.17, 3.12.15 and 3.13.16 interpreter (Darwin 27 arm64). The logs
are [3.11](release-verifier-cpython-311-current-20261026.log),
[3.12](release-verifier-cpython-312-current-20261026.log) and
[3.13](release-verifier-cpython-313-current-20261026.log). Each run used
`CARGO_NET_OFFLINE=true PIP_NO_INDEX=1 UV_OFFLINE=1` with
`python -m pytest -q -p no:cacheprovider` over
`test_python_sdist.py`, `test_distribution_artifact.py`,
`test_coordinated_python_release.py` and `test_python_release_matrix.py`.
These tests include synthetic six-receipt matrix inputs; they do not build or
qualify any of the six actual wheel/sdist cohorts. The older local 3.12/3.13
artifact receipts above belong to a preceding source cut. The present source
still needs frozen package builds and exact hosted macOS 15/Linux x86_64
qualification before a release.
