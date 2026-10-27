---
ddx:
  id: umf.evidence.rust-migration.r8-python-local-pair-check-20261027
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

This is a partial, nonpublishing local qualification attempt on macOS arm64 with
CPython 3.11.17 and Rust 1.90.0. It does not satisfy the hosted six-cohort
matrix and does not authorize publication.

The focused local gate suite passed 91 tests across coordinated-release,
release-matrix, Rust-pair custody, Python-artifact custody, distribution
artifact, and sdist tests. The workflow YAML parsed successfully and scoped
`git diff --check` passed. These tests validate the release gate implementation;
they are not hosted cohort receipts.

Fresh core and codegen distributions were built into `/private/tmp` from the
current worktree. The core artifact verifier accepted the wheel/source payload
and sdist rebuild; its receipt reports non-native payload and wheel byte parity,
but native extension bytes differed across the sdist rebuild. The current
codegen sdist matched all 24 declared source inputs. Rebuilding that sdist
produced the same archive SHA-256 (`7e2193278f5cde65e68486f3600ad07ca73fabfabb4061f03d0bbb1333c23c72`).

The coordinated installed-pair verifier stopped before installation because
its fresh environment could not obtain the pinned `pydantic==2.11.9` dependency;
network access was unavailable and that exact version was not present in the
local cache. Therefore installed import/generation, CLI, and source test steps
remain unqualified. Twine validation was also unavailable. The earlier codegen
sdist hash `243d57f3967e1a4ec7e083edc5f5ac88f6f5a66a9f5c116d79154ed745cf4b46`
was not recoverable in the worktree or temporary artifact locations; this
attempt's current-source build has the distinct hash recorded above.

The workflow requires six hosted cohorts: Linux x86_64 and macOS arm64, each
with CPython 3.11.17, 3.12.15, and 3.13.16. No Linux cohort, aggregate receipt,
hosted run, registry verification, or publication is claimed here. The
workflow uploads qualification artifacts only; publication remains a separate
reviewed action.

Artifact hashes, commands, local host details, and stopping point are recorded
in [local-pair-check.json](local-pair-check.json). Distribution files and the
core verifier receipt remain outside the tracked repository under
`/private/tmp/umf-r8-current-*`.

This attempt preceded the later metamodel refresh of
`python/umf_access/src/umf_access/generated_core.py` in this worktree. Its
artifact hashes therefore describe the captured earlier source snapshot, not
the current checkout or a releasable Python pair.
