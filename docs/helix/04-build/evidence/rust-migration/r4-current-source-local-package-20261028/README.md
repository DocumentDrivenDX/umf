---
ddx:
  id: umf.evidence.rust-migration.r4-current-source-local-package-20261028
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

This packet qualifies the current `umf-core` 0.11.0 and `umf-codegen` 0.2.0 local package pair on macOS arm64. The core `cp311-abi3` wheel and pure-Python codegen wheel were built from the finalized checkout, their source distributions were checked, and the codegen wheel was rebuilt offline from its sdist. The core sdist verifier confirmed exact source-input closure and rebuilt the wheel with matching package payload and wheel identity. The coordinated pair smoke and CLI help checks passed. Both wheels passed `twine check`.

The resource inputs were synchronized from canonical specs after generated metamodel and action identities settled. The action-runtime manifest SHA-256 is `6cab3e96d447b04789e3f9e6741ff061b7a6eeea4681ae9299901865b6147473`; the codegen-resource manifest SHA-256 is `2291ed3fff81c467cf46f959ca6a7291fdb26b90dbff1027c671e6aab5c0d826`. The package source closure contains 510 files and hashes to `0bba415308b116b7725435d24160d706fe32e91fe1160ae13f87eca7d7ade6c8`; see [source-closure.json](source-closure.json). Per-member artifact hashes and binary members are in [artifact-inventory.json](artifact-inventory.json), and the source-to-sdist and coordinated-pair verifier receipts are included separately.

Fresh isolated CPython 3.11.17 and 3.13.16 environments installed the exact wheels with no dependency resolution from the local artifacts. `pydantic==2.11.9` and `pytest==8.4.2` were pinned in each environment; `pip check` and `uv pip check` passed. With `PATH` empty, the installed generator, row-scope, deployment, reviewed-change, and migration probes passed on both interpreters. Each cohort passed 217 tests across `python/umf_codegen/tests`, `python/tests/test_core.py`, and `python/tests/test_rust_core.py`. Mach-O inspection found only system dylib dependencies for the installed extension and CLI. Logs, probe reports, corpora, binary-closure receipts, and toolchain versions are included in this packet.

This is local macOS arm64 evidence only. It does not qualify Linux or Windows, the hosted release matrix, publishing, release, Rust default-route retirement, or additional native adapter semantics. The 217 passing tests are the stated focused installed cohort, not the full Python test suite. The earlier [2026-10-27 packet](../r4-final-local-package-20261027/README.md) remains unchanged and historical.

[`SHA256SUMS`](SHA256SUMS) pins every file in this packet other than itself. Private wheels, sdists, and test environments remain under `/private/tmp/umf-r4-current-source-local-20261028/`.
