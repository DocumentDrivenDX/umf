---
ddx:
  id: umf.evidence.rust-migration.r8-avro-document-inspect-candidate-20261028
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
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-avro-inspect-edit-predecessor
      kind: informed_by
---

# R8 Avro document inspection candidate

This source candidate adds the opt-in `avro.document.inspect` operation with
profile `umf-r5-avro-document-inspect/0.1.0`. The Rust core reports generic
UMF/registered Avro representation admission separately from its bounded
native Avro structural inspection. Invalid admission or an absent unique
payload returns `nativeInspection.status: "not-run"`; admitted documents with
a unique payload return an inspection report and `payloadPath`. The operation
does not mutate or reconstruct its source document. It does not select the
default TypeScript `inspectAvro` route or certify full Avro 1.12.0 validity.

The core/wire checks passed 3/3 and 4/4, including invalid admission, a
valid non-Avro document, ordered dependency resolution, an unresolved native
name, source immutability and host-control refusal. The CLI's opt-in
`document-inspect` command passed 3/3 focused tests with the embedded-adapters
feature. Node's guarded opt-in wrapper passed 3/3 tests (11 assertions)
against a freshly rebuilt temporary addon; Python passed 3/3 tests against a
freshly rebuilt temporary extension; the WASM wrapper passed 6/6 tests (33
assertions) and its native target check passed. Temporary native binaries
were restored or removed after those checks.

The [frozen TypeScript predecessor](../r8-avro-inspect-edit-predecessor/README.md)
and direct differential harness passed six tests and 43 assertions together.
The harness confirms detached candidate source and unknown-content retention
while recording the intentional inspector and report-shape differences. It
compares the existing Rust tagged-tree inspector with TypeScript inspection;
it is not an installed whole-document parity replay. The Rust structural
inspector may classify unresolved names differently from avsc 5.7.9 and always
reports its limited semantic scope.

The R8 symbol inventory and authority-bound gap ledger were deliberately
regenerated for the added opt-in export, then passed their `--check` gates.
The ledger still has 920 logical executable default-route gaps, zero
retirements, and zero promoted current-source installed binding routes. An
installed Node/Bun/Chromium package replay, hosted Python wheels, full Avro
predecessor parity, and the coordinated release matrix remain open.
