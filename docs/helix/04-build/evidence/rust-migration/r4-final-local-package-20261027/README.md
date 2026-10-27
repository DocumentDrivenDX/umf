---
ddx:
  id: umf.evidence.rust-migration.r4-final-local-package-20261027
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

# R4 current-source local Python package qualification

Core, Codegen and Access source distributions were built from the current stable worktree after the Facets and CSV Boolean wrapper additions and regenerated metamodel/action/codegen resource identities. Each wheel was rebuilt from its extracted sdist. The core wheel contains the current Rust core-wire/PyO3 binding and installs with its `cp311-abi3` tag on CPython 3.11.17 and 3.13.16. Artifact member hashes and selected source hashes are recorded in `final-qualification.json`; the complete 505-file source inventory is in [source-closure.json](source-closure.json). Private archives and the member manifest are under `/private/tmp/umf-r4-refresh-20261027/current/`.

Both isolated environments passed `uv pip check` (16 compatible packages). `umf` imported from installed site-packages, and Node/Bun were absent from PATH. The full Python suite passed in both environments: CPython 3.11.17 reported 630 passed plus five subtests in 640.11 seconds; CPython 3.13.16 reported 630 passed plus five subtests in 648.12 seconds.

The focused current-source subset passed 208/208 on Python 3.11.17 (57.34s) and 208/208 on Python 3.13.16 (56.90s). It includes all 16 Facets and CSV Boolean wrapper tests; those also passed separately on both interpreters. The isolated Iceberg replay passed in 347.59 seconds.

This is private local macOS arm64 package evidence. No macOS CI, other platform, release, publication, or default-route retirement is claimed. The core package was built with Hatchling 1.27.0 and Rust 1.90.0.

[`SHA256SUMS`](SHA256SUMS) pins the checked-in evidence files.
