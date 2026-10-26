---
ddx:
  id: umf.evidence.rust-migration.r8-release-pair-readiness
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
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-coordinated-release
      kind: informed_by
---

# R8 Python release-pair readiness audit

This audit records the paired `umf-core` and `umf-codegen` Python distribution
gate and a local macOS arm64 build from one settled source cohort. It is not a
hosted release qualification or publication result. Further Rust work will
change the source cohort and require fresh artifacts before release.

## Pair and current publisher state

`python/pyproject.toml` declares `umf-core` 0.11.0, Python >=3.11,
`pydantic>=2.11,<3`, and a Hatchling custom build hook. The hook checks the
action-runtime resource manifest, adds the reviewed Rust/JSON source closure
to sdists, and builds the Rust Python extension plus CLI for wheels using
`cargo build --locked --release -p umf-core-python -p umf-cli`. On Darwin it
selects a thin target and verifies the Mach-O architecture before assigning
the wheel tag. `python/umf_codegen/pyproject.toml` declares `umf-codegen` 0.2.0,
Python >=3.11,<3.15, exact dependency `umf-core==0.11.0`, pinned Hatchling
1.27.0, and the `umf-codegen` console entry point. Its build hook checks the
nine-resource generated mirror and manifest pin. The distribution version
0.11.0 is distinct from the semantic document profile 0.10.0; the pair
verifiers explicitly require that distinction.

The local Git description is `umf-v0.5.5-73-g23bf095b7` at HEAD
`23bf095b768b6e391da1967339cd559e22ff2eff`; no local tag matching `v0.11.0`,
`umf-core-*`, or `umf-codegen-*` is present. This says nothing about tags in a
remote not inspected here. The separate SDK tag/channel is governed by the
migration plan and is not implied by these Python distribution versions.

`.github/workflows/python-coordinated-release.yml` is the non-publishing
validation workflow for the Rust `umf-core`/`umf-codegen` pair. Separately,
`.github/workflows/pypi.yml` dispatches the existing-release Core publisher for
an exact published core-bearing tag or a successful release workflow. That
publisher binds the immutable tag to its source commit, verifies release
checksums and Core package bytes, and publishes only `umf-core` through PyPI
OIDC. It does not consume Rust pair matrix artifacts. The six-cohort Rust pair
matrix remains unqualified for publication, and candidate artifacts cannot
bypass its required same-run aggregate receipt.

## Local fixed-point and pair gates

After all source writers, including Avro, pause, the local qualification must
start from a fixed-point source cohort. Regenerate only outputs owned by the
repository generators, then check them without writing:

```sh
bun run build:metamodel
bun run check:metamodel
python3 scripts/rust-migration/r8/sync_action_runtime_resources.py --write
python3 scripts/rust-migration/r8/sync_action_runtime_resources.py --check
python3 scripts/rust-migration/r4/sync_codegen_resources.py --write
python3 scripts/rust-migration/r4/sync_codegen_resources.py --check
python3 -m pytest -q -p no:cacheprovider \
  python/tests/test_python_sdist.py \
  python/tests/test_distribution_artifact.py \
  python/tests/test_python_artifact_custody.py \
  python/tests/test_coordinated_python_release.py \
  python/tests/test_python_release_matrix.py \
  python/tests/test_rust_pair_custody.py
```

The two mirror commands should be adjusted to the generator's supported
interface if its current source changes; the `--check` invocations are the
required read-only gates. Then, on each supported host/interpreter, install
the workflow-pinned `build==1.3.0`, `hatchling==1.27.0`, and `twine==6.2.0`,
set Rust 1.90.0 and a fresh isolated `CARGO_TARGET_DIR`, and run:

```sh
python -m build --no-isolation --wheel --sdist python
python -m build --no-isolation --wheel --sdist python/umf_codegen
python -m twine check python/dist/* python/umf_codegen/dist/*
CARGO_NET_OFFLINE=true python tools/verify_python_artifacts.py \
  --wheel python/dist/*.whl --sdist python/dist/*.tar.gz \
  --rebuilt-wheel-directory "$RUNNER_TEMP/umf-core-sdist-rebuilt" \
  --repository . --expected-platform "$EXPECTED_PLATFORM" \
  --receipt "$RUNNER_TEMP/umf-core-artifact-receipt.json"
python tools/verify_python_release_pair.py \
  --repository . --artifacts "$RUNNER_TEMP/umf-coordinated-artifacts" \
  --core-receipt "$RUNNER_TEMP/umf-core-artifact-receipt.json" \
  --receipt "$RUNNER_TEMP/umf-coordinated-release-receipt.json"
```

The artifact directory must contain exactly the just-built core and codegen
wheel/sdist pair. The core verifier checks native wheel payload and rebuilds
the extracted core sdist offline. The pair verifier checks the exact version
pin, rebuilds the codegen sdist without package-index access, installs the
two direct wheels in a fresh environment, verifies installed imports/API and
CLI, and records artifact and source-closure hashes. The workflow then runs
the selected codegen/core tests against that installed pair.

The hosted workflow is the final platform gate: six cohorts, Linux Ubuntu
24.04 x86_64 and macOS 15 arm64, each with CPython 3.11.17, 3.12.15, and
3.13.16, all using Rust 1.90.0. Every cohort must build both distributions,
pass `twine check`, core wheel/sdist verification and offline sdist rebuild,
pair installation/API/CLI verification and installed-pair tests, then upload
source/run/cohort-bound artifacts and receipts. Its dependent aggregate job
must pass the receipt-verifier tests and accept exactly the six receipts from
that same revision and workflow run with matching hashes and source/resource/
sdist-input closures. This produces qualification artifacts only; it does not
publish.

## Same-run custody gate

The coordinated workflow now prepares a deterministic
`umf.rust-port-pair-custody/1` manifest after the six-cohort aggregate passes.
It wraps the existing artifact verification and binds the source revision,
workflow run ID, first run attempt, workflow ref and workflow-file digest to the
aggregate receipt digest and its exact artifact hashes. Cohort jobs and the
aggregate reject rerun attempts; a fresh workflow dispatch is required so old
and rerun artifacts cannot share a custody identity. The aggregate upload name
includes both run ID and attempt. The job retains `contents: read`, has no
registry or OIDC write permission, and creates a qualification artifact only.

The custody scope is exactly the `umf-core` 0.11.0 and `umf-codegen` 0.2.0
distribution pair. The repository also contains the separate `umf-access`
0.1.0.dev7 distribution, which is not built or tested by this matrix. Its
qualification and coordinated release decision remain independent R8 blockers.
`workflowOnMain` records the workflow ref; `releaseEligible` remains false
until full release review. No hosted run has been executed for this change, so
there is no six-cohort qualification result or release-ready manifest yet.
Sol ran the repository virtual environment against the new custody tests,
release-preparation tests and matrix verifier tests: 34/34 passed, with five
additional subtests. The coordinated-workflow tests passed 5/5. These are
local synthetic and structural checks, not hosted cohort evidence.

## Current blockers and evidence boundary

The existing [`r8-python-coordinated-release`](../r8-python-coordinated-release/README.md)
evidence reports an earlier moving-source checkpoint where
`bun run check:metamodel` refused a stale core schema. Sol subsequently
regenerated and passed the source-bound metamodel check, refreshed the action
and codegen mirrors, built a local `umf_core-0.11.0` sdist and verified its
872-file inventory byte-for-byte against that source checkpoint; extracted
offline `cargo check --locked -p umf-cli` passed. A local
`umf_codegen-0.2.0` sdist also built after the mirror refresh. Those archives
were not built together from a final frozen source cohort; Avro and WASM
edits continued afterward. Sol later rebuilt both sdists from the settled
Avro/WASM source cohort. The core archive's extracted 874-file inventory
matches the checkout byte-for-byte and its Rust CLI compiles offline; the
archive hashes and inventory pin are in the
[sdist closure review](../r8-python-sdist-rust-resource-closure.md).
Older synthetic verifier tests (including the recorded 75-test
gate run) validate gate logic, not real artifacts or the six hosted cohorts.
Earlier provisional artifacts were rejected by source-bound capture after
sdist membership changed.

Sol then built both distributions with the workflow-pinned `build==1.3.0` and
`hatchling==1.27.0` from one settled local source cohort on macOS arm64 with
CPython 3.13.16. `twine==6.2.0 check` passed all four artifacts. The
[core receipt](local-macos-arm64-core.json) records the native wheel/sdist
verification and offline sdist wheel rebuild. The
[pair receipt](local-macos-arm64-pair.json) records exact
`umf-core==0.11.0` dependency, byte-identical offline codegen sdist wheel
rebuild, and installed import, generation and CLI smoke checks. The four
artifact SHA-256 hashes are:

| Artifact | SHA-256 |
| --- | --- |
| `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `fd4aa794038a372bfad8162c4014f2b6f8db4e7cbf50840bbaf6888693bc340c` |
| `umf_core-0.11.0.tar.gz` | `f1043bd1282ad23c2b0228a0e161745912eb1be75257c59d2aa596f6c805b648` |
| `umf_codegen-0.2.0-py3-none-any.whl` | `56ae2a10b7ce8c8ec5ac4df0b934f8d736d9e441cd3c7fc7ad07fd22e9700032` |
| `umf_codegen-0.2.0.tar.gz` | `0f8eae78b0b1e3cae6f7e954ec33d455bca9c28d10260d576c6e0095912fa840` |

Both receipts intentionally say `sourceRevision: local-unpinned` and
`publishing: false`; they are a local checkpoint, not one of the six
revision/run-bound hosted receipts. Subsequent Avro/Parquet work invalidates
them for the eventual release source.

The immediate release blockers are: complete the executable Rust migration and
freeze a revision; regenerate and pass the metamodel and both resource mirrors;
rebuild and verify the pair at that revision; run and independently review the
six hosted cohorts plus aggregate; then complete the separately reviewed
publisher, registry hash/clean-install checks, and rollback pins. Windows and
macOS x86_64 are outside the declared
six-cohort matrix. Consumer adoption is separate. No release, hosted pass,
registry artifact, or publication readiness is claimed here.

## Source pins for the prior local inspection

These hashes identify the files at the local-pair inspection checkpoint, not
the current checkout. Later Rust source and Python sdist-closure edits changed
several of them, so they must not be used as current release pins. The previously recorded
`source-coherence-checks.json` captures HEAD `23bf095b768b6e391da1967339cd559e22ff2eff`
and itself says `pending-final-source-freeze`.

| File | SHA-256 |
| --- | --- |
| `.github/workflows/python-coordinated-release.yml` | `ba8f26ce011cbcbca5546951c475780d50a3759ff51b74efe92c1ee3083381ba` |
| `.github/workflows/pypi.yml` | `49ffa0afed27bd001439e036d7e0da1669b731ec241930b8420ef66d26f1a70e` |
| `python/pyproject.toml` | `59345c13edf86878f6f5eb1be2415265ddf5d9567e8a5ebaba86368281fb8e33` |
| `python/umf_codegen/pyproject.toml` | `ba11f571ba9ba8b4a039c80a58d998f17993ecf66ad53db151da2abc507bff25` |
| `python/hatch_build.py` | `44e3d9496515400255ec186cd7e37d3f18f4487c90106ecc0f2536236ab30de8` |
| `python/umf_codegen/hatch_build.py` | `d96edad5e257f19081c9ba65eb3e757b8c1c515bf89240525efaf19fbd1baef0` |
| `tools/_python_sdist.py` | `1964300e73d42a76c2c3ce60b87dd65960d5e615f4bb87b5ea1f5d8bfeea50fe` |
| `tools/verify_python_artifacts.py` | `6fa5cb9e9fcdda2933783831a45cdcc6d6f0933a3f68b63b6013fdd6f1364203` |
| `tools/verify_python_release_pair.py` | `c8a2f2d83c7aee3e468271b038faf2ee6b0d522dd11b7731adc0fb3c7357558d` |
| `tools/verify_python_release_matrix.py` | `9cbc055e2c136321d37ffdb364f4071e044996350bff4b2cd578cd06f7f9cadd` |
