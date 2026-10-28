---
ddx:
  id: umf.evidence.rust-migration.r4-local-source-refresh-20261028
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

# R4 local pair rebuild after canonical resource refresh

This draft records local Darwin arm64 package checks from a prepared source
snapshot based on commit `5e46b5a539d3c9b4985611e0745fcdbe711cee9a`. The
snapshot used the repository’s `scripts/rust-migration/r4/sync_codegen_resources.py`
with `--write`, followed by `--check`. The generated closure is identified by
`source-closure.json` (517 files, SHA-256
`955776f8235a173281ba60091890bfcd94de80aa5a8751798f509ff9b60bbee8`). The
canonical resource output has manifest SHA-256
`74b1fa2f57d22f238351db6e21d3250c05fc9b611c27fd2a41a3598c8f6a5fee`. Exact
before/after file hashes are in `resource-refresh-delta.json`.

The unrefreshed source snapshot correctly refused a codegen package build: five
core resource files, their manifest, and the `_release.py` pin were stale
against canonical `spec/` inputs. The canonical spec inputs were not hand-edited;
the prepared snapshot used only the official synchronizer to refresh generated
outputs. After running the canonical synchronizer in the isolated snapshot, both
packages built, both wheel/sdist sets passed `twine check`, and the codegen
wheel rebuilt byte for byte from its sdist. The core verifier passed its source
payload and sdist checks. The installed pair passed the focused 217 test cohort
on CPython 3.11.17 and 3.13.16 with an empty `PATH`; installed import/generation,
CLI help, and Mach-O dependency closure checks also passed. The tested codegen
wheel declares only its exact `umf-core==0.11.0` package dependency. The
codegen boundary tests reject V8 and foreign process execution patterns.

This is local macOS evidence only. The coordinated pair verifier passed against
the shared source checkout with the pinned build environment (`publishing=false`);
its receipt is `pair-verification.json`. The first restricted attempt reached the pinned
`pydantic==2.11.9` installation but could not resolve the package index; a
narrow authorized escalation retry passed without changing dependencies or
disabling checks. A cached
x86_64 Linux Docker image exposed CPython 3.11.2 and lacked the R4 build tools.
Automatic review rejected a network-capable exact-CPython provisioning
container request because the source was mounted read-write, creating risk to
the source tree. No Linux qualification is claimed. Hosted Linux/macOS
3.11.17, 3.12.15, and 3.13.16 jobs, the six cohort aggregate, release, and
publication remain open. The earlier packet’s 217-test assertion is stale for
its old wheel pair: before resource refresh, both installed replays now report
216 passed and one generated-schema fingerprint failure.

The package artifacts remain private under
`/private/tmp/umf-r4-local-requal-20261028/`. `qualification.json` records host,
toolchain, source, test, and artifact outcomes. Its checksums are listed in
`SHA256SUMS`.

## Reproduction commands

From the source snapshot, with CPython 3.11.17, Rust/Cargo 1.90.0, and build,
Hatchling, and Twine pinned to the versions in `qualification.json`:

```sh
python scripts/rust-migration/r4/sync_codegen_resources.py --write
python scripts/rust-migration/r4/sync_codegen_resources.py --check
CARGO_NET_OFFLINE=true CARGO_TARGET_DIR=/private/tmp/umf-r4-current-source-local-20261028/cargo-target-direct PYO3_PYTHON=/private/tmp/umf-r4-current-source-local-20261028/build-env/bin/python python -m build --no-isolation --wheel --sdist ./python
python -m build --no-isolation --wheel --sdist ./python/umf_codegen
python -m twine check python/dist/* python/umf_codegen/dist/*
```

The installed test command was run once in each isolated environment, from the
source snapshot, with that environment’s Python executable substituted:

```sh
PATH='' <venv>/bin/python -I -B -m pytest -q -p no:cacheprovider python/umf_codegen/tests python/tests/test_core.py python/tests/test_rust_core.py
```

The full raw test outputs are retained in `test-logs/`. The same 217-test
cohorts were replayed from the shared checkout after canonical sync; focused
release verifier, matrix, binary-closure, and resource-sync checks also passed
(61 Python tests and the synchronizer `--check`). The core package receipt,
codegen sdist rebuild receipt, and per interpreter binary closure reports are
also retained. Verify every packet file with `shasum -a 256 -c SHA256SUMS` from this directory. No hosted run or publication is represented here.
