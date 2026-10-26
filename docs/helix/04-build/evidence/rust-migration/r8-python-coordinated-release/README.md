---
ddx:
  id: umf.evidence.rust-migration.r8-python-coordinated-release
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
---

# R8 coordinated Python release validation

This is a non-publishing validation path for the coordinated Rust-port
`umf-core` and `umf-codegen` distributions. It does not publish packages. The
repository also has an exact-tag, Core-only publisher for existing qualified
releases: `.github/workflows/pypi.yml` dispatches
`.github/workflows/publish-pypi.yml` after a published core-bearing release or
successful release workflow. That path verifies the immutable release tag,
source commit, checksum manifest and Core package bytes. It does not consume
the Rust pair matrix or authorize a Rust-port candidate.

The workflow is
`.github/workflows/python-coordinated-release.yml`. Its hosted matrix follows
the migration plan's required Ubuntu/macOS × CPython 3.11.17/3.12.15/3.13.16
cohorts, using Linux x86_64 and macOS arm64 with Rust 1.90.0. Windows and macOS
x86_64 are outside that stated matrix and are not qualified here. The codegen
parent process currently requires POSIX, so a Windows core wheel alone would
not establish a usable coordinated pair.

For each cohort the workflow builds both wheels and sdists, runs `twine check`,
and invokes `tools/verify_python_artifacts.py` with the core sdist and
`CARGO_NET_OFFLINE=true`. That tool checks the core package payload and rebuilds
the extracted core sdist. `tools/verify_python_release_pair.py` then checks the
exact version pin in the codegen wheel, safely extracts its sdist, rebuilds the
pure wheel with package-index access disabled, installs the two direct wheels
into a fresh virtual environment, checks installed import paths and versions,
executes a small native codegen request, and checks the installed CLI. The
workflow also runs codegen tests and core regression tests against the installed
pair. The receipt records each wheel/sdist SHA-256, source revision, cohort,
source-tool hashes, toolchain receipt hashes, the core verifier receipt hash,
and codegen sdist rebuild hash. It uploads the receipts and package artifacts as
GitHub build artifacts only.

Exact workflow commands:

```sh
python -m build --no-isolation --wheel --sdist python
python -m build --no-isolation --wheel --sdist python/umf_codegen
python -m twine check python/dist/* python/umf_codegen/dist/*
mkdir -p "$RUNNER_TEMP/umf-coordinated-artifacts"
cp python/dist/* python/umf_codegen/dist/* "$RUNNER_TEMP/umf-coordinated-artifacts/"
CARGO_NET_OFFLINE=true python tools/verify_python_artifacts.py \
  --wheel python/dist/*.whl \
  --sdist python/dist/*.tar.gz \
  --rebuilt-wheel-directory "$RUNNER_TEMP/umf-core-sdist-rebuilt" \
  --repository . --expected-platform "$EXPECTED_PLATFORM" \
  --receipt "$RUNNER_TEMP/umf-core-artifact-receipt.json"
python tools/verify_python_release_pair.py \
  --repository . --artifacts "$RUNNER_TEMP/umf-coordinated-artifacts" \
  --core-receipt "$RUNNER_TEMP/umf-core-artifact-receipt.json" \
  --receipt "$RUNNER_TEMP/umf-coordinated-release-receipt.json"
```

The helper regression tests are `python/tests/test_coordinated_python_release.py`.
The current local checks are recorded in `local-checks.json`; they are a
nonfinal worktree cohort and hosted matrix artifact receipts are created by the
workflow, not fabricated in this source tree. A passing validation workflow is
not a publication receipt.

The six cohort artifacts now feed a dependent, nonpublishing aggregation job.
`tools/verify_python_release_matrix.py` requires exactly one artifact directory
for each named Linux x86_64/macOS arm64 × CPython 3.11.17/3.12.15/3.13.16
cohort; binds every pair receipt to the expected Git revision and workflow run;
checks pair/core receipt links, current verifier/workflow/fixture hashes, host
and wheel OS/architecture, all wheel/sdist hashes, installed import/generation
and CLI gates, core and codegen offline rebuilds, and shared source/resource/
sdist-input closures; and rejects same-name artifacts with different bytes.
It emits a qualification-only aggregate manifest and does not publish. The
existing-release Core publisher is a distinct path. Its dispatcher and manual
preparation gate are fenced to the qualified `umf-core` 0.10.2 version; the
0.11.0 Rust-port candidate is refused before upload. Fifteen focused
dispatcher/publisher tests, including both 0.11.0 bypass controls, pass. The
Rust pair remains
unqualified for publication until a reviewed coordinated publisher consumes an
aggregate receipt from the same workflow run. Candidate artifacts cannot
satisfy that requirement by themselves.

The synthetic positive and negative matrix tests pass 18/18; combined with the
coordinated-pair helper tests they pass 23/23, independently rerun by Sol.
Workflow YAML parsing and scoped `git diff --check` pass. These tests exercise
the gate logic, not six real hosted artifacts; hosted completion remains open.
The preceding checkpoint's implementation pins are recorded in
`matrix-gate-checks.json`.

The current workflow trigger covers root `Cargo.toml`, `Cargo.lock`, `.cargo/**`,
`rust-toolchain.toml`, the Python package tree, both release verifiers, the
matrix verifier, its focused test files, and the workflow itself. The aggregate
job runs both verifier test files under its pinned CPython 3.11.17 runtime with
`pytest==8.4.2` before consuming the six artifacts. This closes the earlier gap
where a verifier-only change could avoid the release workflow. That checkpoint
recorded workflow SHA-256
`fe38d0ab2e2f6013f1c4b01bea9c8e626ddadf913cd935c0df583308b2b082f1`;
`workflow-trigger-checks.json` records the focused 23/23 local test result,
source pins, YAML parse and diff checks. `matrix-gate-checks.json` remains the
preceding checkpoint; hosted cohorts remain unrun.

The retained provisional local cohort passed the core payload verifier, the
offline core sdist rebuild, the clean installed pair smoke/API/CLI check, and
the codegen sdist rebuild. A later attempted final capture was refused by the
source-bound verifier with `sdist-file-inventory-differs`: the core Keys wire
test was added after the sdist was built. That expected refusal is recorded in
`source-drift-negative-control.json`; it does not replace the provisional
receipt or establish a final source cohort. No final pair receipt was issued.

The existing extracted-sdist verifier pin was stale: it expected
`c5ebe2d0347e580160169d492aae3ffd3f42592bfefa3ae8456b35c7b3a2263a` while the tracked helper closure hashes to
`55afef3a1091a7036b2d7bdc7b9fbcf3e5b0338307f52cad09010cfa2f673ea4`. The
verifier and its workflow/test pins now use the actual helper SHA, with a
negative-control test for modified helper bytes. The workflow also uses
`--no-isolation` after installing the pinned Hatchling backend so the artifact
build uses the qualified backend.

The later `source-coherence-checks.json` checkpoint is pending a final Rust
source freeze. In that moving worktree snapshot, the Python action-runtime
manifest and digest pin were refreshed against the unchanged canonical action
resources, the codegen resource mirror check passed, the 771-file sdist
closure preflight passed, and 74 focused Python tests passed. The check-only
metamodel gate refused with `METAMODEL_STALE_OUTPUT spec/core/schema.json` and
wrote no outputs because Rust compiler provenance changes with Rust source
edits. No wheel/sdist pair was built from that snapshot. After the Rust source
freeze, regenerate and check metamodel provenance, refresh both resource
mirrors/manifests, rerun preflight, then build and verify a new source-bound
cohort. Exact local dependency gaps and the captured source hashes are in the
checkpoint receipt.

Remaining release gates include hosted completion of all six matrix jobs,
independent delivery review, coordinated publication, registry hash verification,
clean installs, and rollback pins. Windows and macOS x86_64 pair qualification
and consumer adoption are separate follow-ons outside the declared six-cohort
release matrix. Publication remains pending the technical R8 gates and review.

The [2026-10-24 gate audit](gate-audit-20261024.json) also closes a trigger
gap by making changes to the standalone PyPI publisher run the coordinated
gate; a focused regression test protects that path. It reran the focused sdist,
artifact-custody, coordinated-pair and six-cohort verifier tests against the
current working tree (75 passed), parsed the workflow YAML, and found no
whitespace errors in scoped paths. It did not build distributions: this host
lacks Twine and Pydantic, Rust/Cargo are not on `PATH`, and the metamodel check
for this moving source snapshot already refused stale compiler-provenance
output. The audit pins the exact workflow, verifier and fixture source bytes;
these local checks establish gate readiness only, not a qualified release
cohort or hosted result.

The in-progress Protobuf source-export Rust owner added an embedded
`spec/extensions/protobuf/package.json` authority. An independent rerun of
the four focused Python release-gate test files found that the new
`include_str!` input escaped the sdist closure (74/75 passed). The source
archive hook, declared force-include map, verifier allowlists and their digest
pin now carry that file. The same four-file suite then passed **75/75** on
the moving worktree. A non-isolated local sdist build succeeded and its tar
listing contains `spec/extensions/protobuf/package.json` with byte-identical
SHA-256 `98e148ae4664a3ad42b1ff94cd0e939fbfe1dab17fa83956fe5e676191af9a96`
to the current source. This local closure correction does not replace the
final source-frozen wheel/sdist pair or six hosted cohort receipts.

The required hosted gate is one run of
`.github/workflows/python-coordinated-release.yml`: Linux x86_64 and macOS
arm64, each on CPython 3.11.17, 3.12.15 and 3.13.16, with Rust 1.90.0. Each
cohort must build both `umf-core` 0.11.0 and `umf-codegen` 0.2.0 wheels and
sdists; pass `twine check`; verify core wheel contents and an offline extracted
core-sdist rebuild; verify an offline codegen-sdist rebuild and fresh installed
pair API/CLI; run the selected codegen and core Python tests against those
installed wheels; and upload source/run/cohort-bound receipts. The dependent
aggregate job must pass its two focused verifier suites and accept exactly the
six receipts from that same workflow run and revision. The workflow only
uploads qualification artifacts; it cannot publish.

Release blockers after this gate audit remain: settle and freeze Rust sources;
regenerate and pass metamodel provenance checks; synchronize both Python
resource mirrors and rerun sdist closure preflight; build a fresh source-bound
pair; pass and review all six hosted cohorts plus their aggregate; then complete
independent delivery review, publish the authorized artifacts, verify registry
bytes and clean installs, and record rollback pins. Windows and macOS x86_64 pair
support and consumer adoption remain separate follow-ons. None of these hosted,
registry, rollback or adoption outcomes is asserted by the audit.
