---
ddx:
  id: umf.evidence.rust-migration.r4-current-source-offline-wheel-qualification-20261023
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r4-delivery
      kind: references
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-008
      kind: informed_by
    - id: CONTRACT-009
      kind: informed_by
    - id: CONTRACT-010
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
---

# R4 frozen-source offline wheel qualification

This receipt records a bounded macOS arm64 package cohort, built from an
isolated snapshot of commit `698d7efb5f298b8cc33769666869904bf9cee31a` plus
R4 packaging/resource-sync and strict JSON response-boundary changes. It
predates the integrated R5/R6 source state and is not final release closure.
The final integrated cohort must rerun resource synchronization,
extracted-sdist offline builds, and installed qualification after core sources
stabilize.

## Source and packaging repairs

The frozen cohort3 snapshot contains 295 files with source-inventory SHA-256
`3130c0756589c9fae9db6e6822eea4e34cfeacc8d042950398f3fc600a886951`. It was
assembled from the committed tree plus R4 packaging/resource-sync and strict
JSON response-boundary changes. The later boundary-checker allowlist update
for standard-library `math` was harness-only, made after snapshot freeze, and
is not included in this hash or the built wheels. A source cleanup removing
an unused `decode_codegen_cli_response_wire` capability requirement also
happened after freeze; cohort3 still carries that unused requirement.

- `python/hatch_build.py` includes the nine trusted schema/package files used
  by Rust `include_str!` declarations in the core sdist.
- `scripts/rust-migration/r4/sync_codegen_resources.py` copies the nine
  `umf.codegen-resources/1` assets from canonical `spec/`, recreates the
  manifest deterministically and updates the release manifest pin. Its
  default `--check` validates exact names, bytes, and pin.
- `python/umf_codegen/hatch_build.py` runs that canonical source check when
  building from the repository; the extracted sdist retains its existing
  internal manifest validation.
- `scripts/rust-migration/r4/qualify.py` inventories these build inputs.

An initial extracted-sdist attempt from the selective temporary snapshot missed
`spec/extensions/tables/operation.schema.json`; this file was already covered
by the existing package force-include rule. The snapshot selection was repaired
to include it. This was not a second sdist-manifest defect. The actual core
sdist defect was omission of the nine `include_str!` resources listed in the
packaging source list. The corrected extracted core sdist contains those nine
files and the tables operation schema (10/10 checked paths).

The first post-regeneration wheel pair exposed a real cohort mismatch: the
codegen package still pinned generated resource hashes from an older core
cohort. Five of nine core assets differed (`core.schema.json`,
`core.reference-schema.json`, `core.package-schema.json`,
`core.constraints.json`, and `core.domain-policy.json`); four extension
manifests matched. The installed CLI refused admission with
`ENGINE_UNAVAILABLE` / `Native UMF core resource cohort differs`. The expected
`original-json` corpus baseline was not refreshed. The deterministic sync/check
now binds packaged codegen assets and release pin to canonical `spec/` bytes.
Protocol `umf-codegen-r3-seven-ops-nine-resources/1` and package versions
`umf-core 0.11.0` and `umf-codegen 0.2.0` were unchanged.

The frozen canonical resource manifest SHA-256 is
`3c502844c50c2161e8ce3158770cb9c4465f5d519c2ba65f2c38bdc8c8789e3d`.
`sync_codegen_resources.py --check` passed on this snapshot. The native CLI
capability reports from both installed interpreters include the same nine-file
manifest and manifest hash.

## Cohort3 artifacts and rebuild

All artifacts were built offline from this single isolated snapshot. The core
wheel was rebuilt from the extracted core sdist; the codegen wheel was rebuilt
from the extracted codegen sdist. `CARGO_NET_OFFLINE=true` was set for the
native build.

| Artifact | SHA-256 |
| --- | --- |
| `umf_core-0.11.0.tar.gz` | `eb602f1a237a1b59abd0ffec07b177571bb50f053dd97c85c86204edbe4f92e9` |
| `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `30b960deb0b2d55c361822016f8ba73db50bada2d6a452443547f5ecc0d1321a` |
| `umf_codegen-0.2.0.tar.gz` | `76db75e7baf767210c63740797f2b7dd30f75410af76cd29fb8555e063d2c938` |
| `umf_codegen-0.2.0-py3-none-any.whl` | `4fdd9ff3f7df20836bbbc448968f34d37b309c2e72c0093656408520e3d41683` |

Artifacts and captured reports are under
`/private/tmp/umf-r4-current-20261023/cohort3/`. The venvs are under
`/private/tmp/umf-r4-current-20261023/py311` and `py314`.

The rebuild used the repository's configured build environment and no network:

```sh
pyproject-build --sdist --no-isolation                 # python/
tar -xzf umf_core-0.11.0.tar.gz                       # extracted core sdist
env PATH=/opt/homebrew/opt/rustup/bin:/usr/bin:/bin \
  CARGO_TARGET_DIR=/private/tmp/umf-r4-current-20261023/cohort3/cargo-target \
  CARGO_NET_OFFLINE=true pyproject-build --wheel --no-isolation
pyproject-build --sdist --no-isolation                 # python/umf_codegen/
tar -xzf umf_codegen-0.2.0.tar.gz                      # extracted codegen sdist
pyproject-build --wheel --no-isolation
```

Build commands ran from the corresponding project or extracted-sdist root. Both
sdist builds and both extracted-sdist wheel builds succeeded. The extraction
and build directories were isolated under `/private/tmp/umf-r4-current-20261023/`.

## Installed results

The macOS arm64 host interpreters were CPython 3.11.17 and 3.14.8. Both clean
offline venvs used this `cp311-abi3` core wheel plus the same pure Python
codegen wheel. `pip check` reported “No broken requirements found” in each.
The installed core reported version 0.11.0, codegen 0.2.0, protocol
`umf-codegen-r3-seven-ops-nine-resources/1`, and nine resources. The strict
codegen resource-manifest loader and native capability manifest check passed.

All probes ran as `env -i PATH='' <venv>/bin/python -I ...`; their guards forbid
JavaScript process launches, executable discovery, and external network access.
Each runtime passed:

- Generator parity: 30 corpus cases; writer and integrity controls passed.
- Row-scope parity: 6 cases.
- Deployment parity: 15 cases and 30 tamper controls.
- Migration parity: 17 cases, 99 tamper controls, and 4 deadline controls.
- Reviewed changes: 3 candidate parity cases, 8 malformed/forged refusals, and
  22 native CLI launches.

The packaged CLI and extension binary closure passed on both runtimes. The
extension loads only system `/usr/lib/libiconv.2.dylib` and
`/usr/lib/libSystem.B.dylib`; the bundled CLI loads only system
`/usr/lib/libSystem.B.dylib`. The extension's absolute
`LC_ID_DYLIB` contains the isolated Cargo target path, but this is an install
identity and not a load dependency. `pip check` passed on both runtimes and the
strict JSON response parser's 21 unit tests passed on each. No JavaScript
assets are present in either wheel. These results establish local installed
behavior for this frozen cohort; they do not qualify other operating systems,
all R4–R8 source modules, native migration lifecycle release, or the later
final integrated cohort.

The original `cohort3/py311-unit-tests.log` is a retained failed run: 20 of
21 tests passed, but the boundary test rejected the newly imported standard
library `math` module before its allowlist was updated. After that
post-snapshot harness correction, independent Sol review reran the same
installed CPython 3.11 unit command with `env -i PATH=''` and `-I`; all 21
tests passed. The separate correction log is
`cohort3/py311-unit-tests-math-allowlist-correction.log` (SHA-256
`bc534f0fad2a5945d9acde8493c0c031a263a1b710f219f52189f43f7232ae1d`).
The CPython 3.14 unit log passed on its first recorded run. The allowlist
edit is outside the 295-file frozen artifact source inventory, so this
correction does not relabel either wheel's source cohort.

Machine-readable per-runtime outputs are `py311-generator.json`,
`py311-deployment.json`, `py311-migration.json`, `py311-capabilities.json`,
`py311-binary-closure.json`, and the corresponding `py314-*` files in the
cohort directory. Capability output hashes match across interpreters:
`a92eb6e7489994465f7e9279a131744e63065d754a3b9ecbd892d420cf3ef6a4`.

### Exact numeric-token regression and correction

Cohort2 passed Python object equality for `original-json` but failed exact
canonical-byte parity. Expected output was 83,897 bytes, SHA-256
`5837fc4a29a5a8e7c54058f00a4f4578973a4b3ef8b5f9483287b1831d7dea97`; the
wire-decoded output was 83,921 bytes, SHA-256
`1d5a5ad73587a3235933cb526c512f19aba95e4f674dd42612ff4b17498cc927`.
Twelve numeric fields changed from Python `int` to `float`:
`$.result.description.actions.commerce.shipOrder.declaration.writes[0].maxEntities`,
`$.result.description.limits.batchItems`, `getManyKeys`, `page`,
`$.result.description.records.commerce.Order.fields[3].facets.precision`,
`scale`, `$.result.description.relationships[0].sourceMultiplicity.min`,
`targetMultiplicity.max`, `targetMultiplicity.min`,
`relationships[1].sourceMultiplicity.max`, `sourceMultiplicity.min`, and
`targetMultiplicity.min`. Python considers `1 == 1.0`, hiding this failure.
Raw wire was 285,930 bytes (SHA-256
`8b74e1c14d4935623a7b98ac0755f89dc5e351945a126d14f01763467d60f029`); its
first `maxEntities` encoded binary64 bits `3ff0000000000000`.

The narrow wrapper fix requests the CLI's existing JSON output and decodes it
with bounded, deadline-aware strict admission. Raw CLI JSON was 83,898 bytes
including a trailing LF; parse then canonical serialization exactly matches
the 83,897-byte baseline. Seven generated file strings were already
byte-identical in cohort2. Tests cover `1`, `1.5`, negative zero, `1e21`,
`1e-7`, malformed/duplicate/nonfinite JSON, oversized integers, response
size, traversal bounds, and deadlines. Negative zero and values outside the
safe integer profile are refused. `_from_wire` and the historical baseline
were not changed.

The CLI capability handshake still reports `outputWireProtocol:
umf.core-wire/1`; it does not explicitly negotiate the selected JSON response
format. This bounded cohort leaves that for independent protocol review. No
protocol or package version changed.

## Verification commands

The source-bound packaging and asset check is:

```sh
python3 scripts/rust-migration/r4/sync_codegen_resources.py --check
```

Installed probe commands (substitute `py311` or `py314`) were:

```sh
env -i PATH='' /private/tmp/umf-r4-current-20261023/$py/bin/python -I \
  tests/codegen/installed_probe.py --corpus /private/tmp/umf-r4-codegen-corpus.json \
  --report /private/tmp/umf-r4-current-20261023/cohort3/$py-generator.json
env -i PATH='' /private/tmp/umf-r4-current-20261023/$py/bin/python -I \
  tests/codegen/row_scope_probe.py --corpus /private/tmp/umf-r4-row-scope-corpus.json
env -i PATH='' /private/tmp/umf-r4-current-20261023/$py/bin/python -I \
  tests/codegen/deployment_probe.py --corpus /private/tmp/umf-r4-deployment-corpus.json \
  --report /private/tmp/umf-r4-current-20261023/cohort3/$py-deployment.json
env -i PATH='' /private/tmp/umf-r4-current-20261023/$py/bin/python -I \
  tests/codegen/migration_probe.py --corpus /private/tmp/umf-r4-migration-corpus.json \
  --report /private/tmp/umf-r4-current-20261023/cohort3/$py-migration.json
env -i PATH='' /private/tmp/umf-r4-current-20261023/$py/bin/python -I \
  tests/codegen/reviewed_changes_probe.py --corpus /private/tmp/umf-r4-reviewed-changes-corpus.json
```

The prior failure cohort at `61fceefd0` remains historical evidence: its 293-
file source inventory SHA was
`79e03f4f19770148f531d19f80f931e1c3432467ffa42a88615cdaa3822835d8`, its core
sdist SHA was
`fe08731106c05667dfe064f60a98ed0dd1d3b01a004751bde32f9af9c9bf953e`, and its
offline extracted-sdist build failed because the trusted include resources were
absent. After metamodel regeneration, the first wheel pair from commit
`698d7efb5` was also a recorded failed attempt: core wheel SHA
`e0cc5cfa17d440fb2f7402900d1388b765cfc0274174edcb888cf8bc4cec0c84` and
codegen wheel SHA
`52dfc2a2966176be2c5e8d43d900a64c8b3f0527b7597cd1b927b5f69cbf9bad` failed
the strict resource-cohort admission because codegen still contained stale
generated bytes. Cohort2 is separately recorded as failed exact numeric-token
parity above, despite equality-based parity passing. Cohort3 is the corrected
strict-byte installed cohort. This receipt preserves those failures and does
not claim final integrated R8 completion.
