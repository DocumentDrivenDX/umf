---
ddx:
  id: umf.evidence.rust-migration.r5-arrow-ipc-python-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-016
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-arrow-ipc-capture-predecessor-20261027
      kind: informed_by
---

# Arrow IPC exact-capture installed Python binding

The [receipt](receipt.json) records a fresh CPython 3.13.16 macOS arm64 wheel
built from the current Arrow IPC source cohort and installed into an isolated
environment. Six focused tests passed, including all 18 authored IPC fixtures,
exact byte equality at 1,000,000 bytes, refusal at 1,000,001 bytes, unknown
representation export refusal, and cooperative controls. The receipt pins the
wheel, native extension, and selected source-file hashes.

This qualifies only the opt-in exact-source capture/export/inspect Python
binding for this local cohort. Native Arrow semantics, other Python target
platforms, default routes, and release qualification remain open.
