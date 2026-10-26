---
ddx:
  id: umf.evidence.rust-migration.r8-python-cpython313-successful-verifiers-20261026
  type: execution-evidence
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
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-cpython313-installed-smoke-20261026
      kind: extends
---

# CPython 3.13 successful installed codegen verifiers — 2026-10-26

This follow-up closes the successful-call gap identified in the [prior installed
smoke](cpython-3.13-installed-smoke-20261026.md): installed Python now exercises
successful `verify_table_deployment` and `verify_table_migration`, with migration
compilation in the same run. This is a local macOS arm64 CPython 3.13.16
observation of two core/codegen wheels; it is not a release gate or complete
Python API qualification.

## Runtime and artifacts

The run reused the fresh venv at
`/private/tmp/umf-r8-python-closure-313-20261026/installed-env-evidence` and the
exact wheel pair from the preceding note. Their SHA-256 values were rechecked:

| Installed wheel | SHA-256 |
|---|---|
| `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `7d4e0cc1ab47f6e59798aa007f018e5370598e8497b9fee2076bae5d43c87e56` |
| `umf_codegen-0.2.0-py3-none-any.whl` | `5418265542a5b5710e164038f07062509e3c8646386fd2c2bf3e42ddcc0fd20e` |

The installed dependency set was `pydantic==2.11.9`, `pydantic-core==2.33.2`,
`annotated-types==0.8.0`, `typing-extensions==4.16.0`, and
`typing-inspection==0.4.4`. Their wheel SHA-256 values are recorded in the
[preceding smoke](cpython-3.13-installed-smoke-20261026.md). `pip freeze` in
this venv showed only those five distributions and the two direct wheel installs.
Dependency wheel hashes were:

| Dependency wheel | SHA-256 |
|---|---|
| `pydantic-2.11.9-py3-none-any.whl` | `c42dd626f5cfc1c6950ce6205ea58c93efa406da65f479dcb4029d5934857da2` |
| `pydantic_core-2.33.2-cp313-cp313-macosx_11_0_arm64.whl` | `f517ca031dfc037a9c07e748cefd8d96235088b83b4f4ba8939105d20fa1dcd6` |
| `annotated_types-0.8.0-py3-none-any.whl` | `f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0` |
| `typing_extensions-4.16.0-py3-none-any.whl` | `481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8` |
| `typing_inspection-0.4.4-py3-none-any.whl` | `65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147` |

The installed Python reports CPython 3.13.16 on Darwin 27.0.1 arm64. Runtime
`PATH` was restricted to that venv's `bin`, `/usr/bin`, and `/bin`; checks found
no `node`, `bun`, `cargo`, or `rustc`. The package import locations were inside
that venv. The bundled CLI SHA-256 was
`1b6ed885fda840815a554ffc1f24f1c88ab7257857150db9a85e1498378a17e2`.

The installed codegen resource manifest SHA-256 was
`4b8a167c591ca62f4e4af127856a5b550e2fe9a0a6cc1434e3b49ac129aa3efd`; the
manifest and nine listed resource digests matched the current source mirror
byte-for-byte. The manifest identity check is performed by the installed
wrapper before CLI dispatch.

## Fixture provenance and results

Fixture inputs were generated before the restricted-PATH run with Bun 1.4.3
from the repository's TypeScript deployment compiler and table-migration test
fixture sources. The source fixture was
`tests/binding/fixtures/table-lifecycle-note.json` (SHA-256
`0f8a2f5d38d32514ec38fc3bbe393c5b5a52d1720b8a16837678e2086b939a9a`), and
`tests/unified/table-migration-fixture.ts` (SHA-256
`a4900b512d39e9d2ac6dd23e46651b9d2099a180cda8596e4eea84c30d5bf765`)
constructs the appended-table successor. The imported compiler entry
`src/table-deployment/index.ts` had SHA-256
`6130d0084e7f3b51aa06a9747a26a1f05a4b561e8bd2791da4874e8574d12e88`.
The fixture-generation script was
`/private/tmp/umf-r8-python-closure-313-20261026/make-success-fixtures.ts`
(SHA-256 `ccaa92cfc6c8c1b028182ed7b8bdfe7569e9c8bd293d674754d901d1ad67eed0`).
Generated inert input hashes:

| Input | Bytes | SHA-256 |
|---|---:|---|
| Base deployment bundle | 8,940 | `7344373f108e92cd12cbb1a969f0dc75e239392dfb7c9117bcd3756f2fecc2d2` |
| Appended-table next bundle | 14,227 | `7c93c8a567756459e1f8df99856145fd21fd5602bdd50ed454d516193b4549ed` |
| Migration request (previous/next bundles, fixed synthetic predecessor) | 23,336 | `0bbe26e8ad64f6ffef12d187c644e13c7ee9216f543188ec8b367e851c716889` |

The installed Python calls returned successfully:

- `verify_table_deployment(bundle)` returned a value equal to the input bundle; it contained 18 steps.
- `compile_table_migration(...)` returned `status: compiled` with 13 steps.
- `verify_table_migration(plan)` returned a value equal to that compiled plan. Its digest was `1eec0922dc8e2e23c69c849050a58d0e50bae8d1e43c7a90a6ed0488ec19cedb`.

The driver was
`/private/tmp/umf-r8-python-closure-313-20261026/successful-verifier-smoke.py`
(SHA-256 `ad252ac0725d58f54f0c7f0e9cc2e8aeb4317c5a95eb07829dbcdfa58ffaba57`).
Its successful output log is
`/private/tmp/umf-r8-python-closure-313-20261026/logs/successful-verifier-smoke.log`
(SHA-256 `5539d5f9861ae97bb371d8e0b98ade4f0213a8ecb0394c9fc443e309b7adf982`);
installed identities are in
`/private/tmp/umf-r8-python-closure-313-20261026/logs/installed-identities.json`
(SHA-256 `423f92c725ded2c91911624d9ff8f65239200eac11525e7fff8c1de8678715a4`).
These local paths are retained on the tested host and are not checked into the
repository.

## Limits

The migration predecessor digest is a fixed synthetic value. Verification
establishes plan self-consistency, not authenticated ledger history, approval,
current database state, or execution. The deployment check likewise establishes
bundle consistency; no database was contacted. Fixture creation used Bun and
repository TypeScript, but the installed Python runtime calls had neither Bun,
Node, Cargo nor rustc available. The prior note's provenance says the wheel pair was built from its copied
source snapshot after authored resource synchronization; the snapshot has no Git
metadata, so that history cannot be independently reconstructed from it. A
comparison to the current worktree found byte-identical Python `umf` and
`umf_codegen` package sources, codegen source, CLI/compiler crates, wire crates,
and the Python core binding (excluding bytecode caches). Five `crates/umf-core`
files differ: `json_schema_inspect.rs`, `selection.rs`,
`selection_diagnostics.rs`, `selection_host_json.rs`, and the
`r5_json_schema_import_session.rs` test. Therefore these wheels are the recorded
post-resource-sync pair, but were not rebuilt from the exact current dirty
worktree. The artifact hashes bind the tested wheels and the listed hashes bind
fixture inputs; this local run does not capture a frozen transitive source
closure. No source fix, version change, release, or publication was made. Broader Python APIs, hosts, Python versions, package matrices and R8
completion remain unqualified.
