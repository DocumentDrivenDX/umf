---
ddx:
  id: umf.evidence.rust-migration.r8-python-cpython313-installed-smoke-20261026
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
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# CPython 3.13 installed UMF smoke — 2026-10-26

This note records a local installed-artifact smoke for the refreshed `umf-core`
and `umf-codegen` wheels. It is a scoped runtime observation, not the R4/R8
release gate, a full Python API qualification, or release approval.

## Source and artifact identity

The source snapshot came from a worktree reported at HEAD
`0adc523f4aceced33315f16438b86bc7b059a446`, with uncommitted core/wire staging.
The refreshed build snapshot followed authored resource synchronization and
preceded commit `280ea636a`. The copied tree at
`/private/tmp/umf-r8-python-closure-313-20261026/source` has no `.git` directory,
so that reported provenance and the exact uncommitted file list cannot be
independently recovered from the snapshot. The core and codegen sdists and wheels
below identify the tested artifacts; their hashes do not prove the source
worktree was clean or fully bind its closure.

The tested artifacts are in
`/private/tmp/umf-r8-python-closure-313-20261026/dist-refreshed/`:

| Artifact | SHA-256 |
|---|---|
| `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `7d4e0cc1ab47f6e59798aa007f018e5370598e8497b9fee2076bae5d43c87e56` |
| `umf_core-0.11.0.tar.gz` | `f2609fd38b4fcd501634b7af97a74dfe17fdefdb77fd2b30b3b516197df0180b` |
| `umf_codegen-0.2.0-py3-none-any.whl` | `5418265542a5b5710e164038f07062509e3c8646386fd2c2bf3e42ddcc0fd20e` |
| `umf_codegen-0.2.0.tar.gz` | `01d8fba8c7ef2d3a401a425b2fff88000f90f28d06b7835d68a987faba014abc` |

The core sdist packages the native source closure; these hashes identify the
specific artifacts used here. They do not repair the missing source Git
revision or establish a frozen source worktree.

## Environment and installation

The run used CPython 3.13.16 on Darwin 27.0.1 arm64. A fresh virtual
environment was created at
`/private/tmp/umf-r8-python-closure-313-20261026/installed-env-evidence`.
The install used offline package resolution and these artifacts:

```sh
PATH="$VENV/bin:/usr/bin:/bin" PIP_NO_INDEX=1 PIP_NO_INPUT=1 \
  PIP_FIND_LINKS="/private/tmp/umf-r8-python-closure-20261025/wheelhouse /private/tmp/umf-r8-python-closure-313-20261026/wheelhouse" \
  "$VENV/bin/python" -m pip install pydantic==2.11.9 \
  /private/tmp/umf-r8-python-closure-313-20261026/dist-refreshed/core/umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl \
  /private/tmp/umf-r8-python-closure-313-20261026/dist-refreshed/codegen/umf_codegen-0.2.0-py3-none-any.whl
```

The installed dependency wheels and SHA-256 values were:

| Distribution | Wheel | SHA-256 |
|---|---|---|
| `pydantic==2.11.9` | `pydantic-2.11.9-py3-none-any.whl` | `c42dd626f5cfc1c6950ce6205ea58c93efa406da65f479dcb4029d5934857da2` |
| `pydantic-core==2.33.2` | `pydantic_core-2.33.2-cp313-cp313-macosx_11_0_arm64.whl` | `f517ca031dfc037a9c07e748cefd8d96235088b83b4f4ba8939105d20fa1dcd6` |
| `annotated-types==0.8.0` | `annotated_types-0.8.0-py3-none-any.whl` | `f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0` |
| `typing-extensions==4.16.0` | `typing_extensions-4.16.0-py3-none-any.whl` | `481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8` |
| `typing-inspection==0.4.4` | `typing_inspection-0.4.4-py3-none-any.whl` | `65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147` |

The `pydantic-core` digest is also recorded in
`/private/tmp/umf-r8-python-closure-313-20261026/wheelhouse/pydantic_core-2.33.2-cp313-cp313-macosx_11_0_arm64.whl.hash.txt`.
The package was fetched from the configured Python package index after the
sandboxed request failed DNS resolution; pip reported the file as cached. The
recorded hash is computed from the saved wheel.

The runtime `PATH` was restricted to the virtual environment and `/usr/bin:/bin`.
Checks confirmed that Node, Bun, Cargo, and rustc were not available on that
path. Imports came from the installed environment; the generator fixture was
read from the captured source snapshot listed above.

## Observed operations

The installed smoke passed these checks:

- Imports resolved from the fresh environment; installed versions were
  `umf-core==0.11.0`, `umf-codegen==0.2.0`, and `pydantic-core==2.33.2`.
- Core reported document version `0.10.0`; YAML read, validation, write, and
  read-back preserved the tested empty document and validated as valid and
  complete.
- `generate_python_client` succeeded on
  `fixtures/actions-binding/source.json` and returned files plus a source digest.
- `compile_table_deployment` and `compile_table_migration` returned structured
  `blocked` outcomes for deliberately incomplete `{}` inputs.
- `discover_table_migration_changes({}, {})` and
  `normalize_row_scope({}, context={})` returned `GenerationError` refusals for
  incomplete inputs.
- Installed `umf-codegen --help` displayed its generate/check CLI usage.

The exact logs are retained under
`/private/tmp/umf-r8-python-closure-313-20261026/logs/`:

| Log | SHA-256 |
|---|---|
| `install-cpython313-evidence.log` | `7dda5d052fb80c603753aa78ccc9c14d56a8f23406ee16aeabfe37f02892cde1` |
| `smoke-cpython313.log` | `5b062aefdbac48ae689f8b0025a0b11202931556dd0b6f638972368b6c553b8d` |
| `cli-help-cpython313.log` | `8e516b50716b9cb62693629937b1e6bd6dff34b61a8c28176f625165a61dbb90` |
| `toolchain-path-cpython313.log` | `fcc8e468b06ce7594679a6b8319155387f5b9800bad8b2ddc9d36cfc76a18721` |

The smoke driver is
`/private/tmp/umf-r8-python-closure-313-20261026/smoke-cpython313.py` (SHA-256
`a00701931f7ed6107b6a381d4b439cc7c26c2e8ac10613524fb2de0d827f051c`). These
logs and files are local temporary evidence, not repository artifacts.

## Limits

Successful `verify_table_deployment` and `verify_table_migration` calls were not
qualified: the smoke's deliberately incomplete deployment and migration inputs
were blocked, so they did not produce valid bundles or plans to verify. The
other codegen APIs and their successful semantic paths are not broadly
qualified by this smoke. It also does not qualify the complete `umf` Python API,
all codegen operations/fixtures, sdist rebuilds, other Python versions or
platforms, source cleanliness, the hosted release matrix, production use, or
publication. No release claim follows.
