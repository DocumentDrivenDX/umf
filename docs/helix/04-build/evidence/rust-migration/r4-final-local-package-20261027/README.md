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

# R4 local Python package rebuild and installed probes

Core, Codegen and Access source distributions were built from the current
shared worktree. Each wheel was then rebuilt from its extracted sdist. The
core artifact includes the current Rust core-wire source, Arrow and
Cardinality wrappers, and Core Schema Properties wrapper. The package and
source closure hashes are recorded in [final-qualification.json](final-qualification.json).
The complete 499-file current source inventory is retained in
[source-closure.json](source-closure.json). Artifact member manifests and
archives remain in `/private/tmp/umf-r4-final-local-20261027/current/`; their
manifest SHA-256 is in the qualification receipt.

The extracted-sdist builds used Hatchling 1.27.0 and Rust 1.90.0 on macOS
arm64. The core wheel has the `cp311-abi3` tag and installed cleanly on
CPython 3.11.17 and 3.13.16. Both environments passed `uv pip check`; Node
and Bun were absent from the installed-probe PATH.

After the workflow-only source pin correction, the full core Python suite
passed in both installed environments: CPython 3.11.17 reported 613 passed,
five passing subtests in 496.96 seconds; CPython 3.13.16 reported 613 passed,
five passing subtests in 500.15 seconds. Each run emitted one pytest cache
warning because the shared worktree denied writing `.pytest_cache`; test
execution completed successfully. Focused Arrow, Cardinality, Core Schema
Properties, source-distribution and resource tests also passed 66/66 in both
runtimes, and the post-correction artifact-custody/finalizer tests passed
11/11 in each runtime.

The 499-file source closure was independently checked after these runs. The
R4 inventory generator's 495-file base matched exactly; the four additional
packet entries (the workflow, Cardinality and Schema Properties tests, and
artifact verifier) also matched their recorded SHA-256 values.

This is private local package evidence only. No macOS CI, release, publication,
or default-route retirement is claimed.

[`SHA256SUMS`](SHA256SUMS) pins the checked-in evidence files.
