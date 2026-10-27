---
ddx:
  id: umf.evidence.rust-migration.r8-python-pair-current-metamodel-20261027
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

This nonpublishing recheck used the current worktree at source revision
`5a2f5bc1983135620f2b9a35ac201d6eef43f37a`, macOS arm64, and CPython 3.11.17.
The current generated metamodel outputs include `python/umf_access/src/umf_access/generated_core.py`
SHA-256 `b596bd655f1de80b8773640eded8b31a2c4069ddf41700a1b60953b11a6f5b32`.

Fresh core and codegen wheel/sdist builds were attempted into
`/private/tmp/umf-r8-pair-recheck-20261027/artifacts`; the directory remains
empty. Core packaging stopped because `python/src/umf/action_runtime_resource_manifest.json`
does not match the canonical spec resources. Codegen packaging stopped in
`sync_codegen_resources.py`: its five embedded core resources, resource
manifest and `_release.py` digest pin differ from the current canonical sources.
No source files were changed for this check.

The exact 24 declared codegen sdist source inputs were compared successfully
against the existing sdist at `/private/tmp/umf-r8-current-codegen-sdist/`.
That archive has SHA-256
`7e2193278f5cde65e68486f3600ad07ca73fabfabb4061f03d0bbb1333c23c72`; it is a
prior artifact, and the check does not qualify it as a current-source release.
The prior core wheel at `/private/tmp/umf-r8-current-core-dist/` failed the
current-source verifier with `An official action runtime source digest
changed`, so current core payload verification is blocked.

The installed-pair gate was not attempted: no current pair artifacts exist and
`pydantic==2.11.9`, the verifier's pinned dependency, was not found in the local
pip/uv cache. No network installation was attempted. `python/uv.lock` declares
Pydantic 2.14.1, which does not satisfy that exact gate pin. No installed import,
generation, CLI, or test result is claimed.

Artifact and source hashes, exact commands, and bounded outcomes are in
[current-pair-recheck.json](current-pair-recheck.json). No release or hosted
cohort claim follows from this attempt.

## Post-refresh recheck — 2026-10-27

The canonical refresh scripts now pass `--check`: the core action-runtime
manifest covers nine canonical resources with pin
`084d1d8ca8f4f839b5624cf1f52d88ec98d3405a15f137afe3a5bf139fee5c09`; the
codegen mirror covers nine resources with manifest SHA-256
`f7730e5613742cdd0ffffd3b0a95eff4294e56aeaba7be51e2bd9663010c8807`.

Fresh core 0.11.0 wheel/sdist and codegen 0.2.0 wheel/sdist were built under
`/private/tmp/umf-r8-pair-refreshed-20261027/artifacts` with CPython 3.11.17,
Rust 1.90.0, and Cargo offline. Core exact source-payload verification passed.
Its offline extracted-sdist rebuild matched the nonnative package payload,
metadata, version and tag; native extension and CLI bytes differed across
rebuild. The codegen sdist matched all 24 current declared source inputs. Its
rebuilt wheel was byte-identical to the direct wheel, and all 17 packaged
codegen source files matched the current source tree.

The verifier and release workflow both pin `pydantic==2.11.9`, while
`python/uv.lock` resolves the current development environment to 2.14.1. The
release pin remains intentional: it exercises the supported Pydantic 2.11
series as a lower-version compatibility cohort; the lockfile is the development
resolution. The release pin is within `pydantic>=2.11,<3` and agrees in both
release-gate locations, so no verifier/workflow edit was made. An offline uv
cache lookup confirmed the exact 2.11.9 wheel is unavailable, so installed-pair
checks were not attempted.

See [post-refresh-pair-recheck.json](post-refresh-pair-recheck.json) for artifact,
source and receipt hashes. This local macOS arm64 result is not the hosted six-
cohort gate and makes no publication claim.

## Installed release-pair qualification — 2026-10-27

With the exact pinned dependency wheels in a private wheelhouse, the
nonpublishing coordinated pair verifier passed on macOS 27.0.1 arm64, CPython
3.11.17, and Rust 1.90.0. It installed the fresh core 0.11.0 and codegen 0.2.0
wheels into an isolated environment and passed installed import/generation and
CLI help. The codegen sdist matched its 24 current inputs and rebuilt to a wheel
byte-identical to its direct wheel. The exact verifier output is retained in
[installed-pair-receipt.json](installed-pair-receipt.json); its bound core source
payload receipt is [core-artifact-receipt.json](core-artifact-receipt.json).

The coordinated workflow's installed source tests passed **217 tests** with
Pydantic 2.11.9 and pytest 8.4.2: all `python/umf_codegen/tests`,
`python/tests/test_core.py`, and `python/tests/test_rust_core.py`. Pytest emitted
one cache warning because the isolated test process could not write into the
worktree's `.pytest_cache`; no test failed. The details and wheelhouse hashes
are in [installed-python-tests.json](installed-python-tests.json).

This is one local macOS arm64 / CPython 3.11.17 cohort. It does not establish the
hosted Linux/macOS × CPython 3.11/3.12/3.13 matrix, an aggregate receipt,
registry verification, or publication.
