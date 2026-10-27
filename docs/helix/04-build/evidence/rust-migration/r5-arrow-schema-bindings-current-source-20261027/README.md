---
ddx:
  id: umf.evidence.rust-migration.r5-arrow-schema-bindings-current-source-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-arrow-typescript-predecessor-20261027
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-arrow-schema-bindings-20261027
      kind: supersedes
    - id: CONTRACT-016
      kind: informed_by
---

# Arrow schema JSON current-source replay

This packet refreshes the opt-in five-operation Arrow schema JSON binding after
Python Ruff cleanup and generated metamodel/action identity changes. It pins the
current source cohort and rebuilt Node/WASM artifacts; no default route is
selected. The Node addon and WASM package were built from fresh, separate private
Cargo targets under /private/tmp/umf-arrow-final-lint-node and
/private/tmp/umf-arrow-final-lint-wasm.

Node 26.12.1, Bun 1.4.3 and real Chromium 153.0.8010.12 each passed 52 authored
cases across import, inspect, export, getNode and proposeNodeEdit (260 corpus
operations), plus 17 focused cases: 16 JSON-wire imports and 26 focused
operations. Each host performed 302 counted binding calls. The focused checks
include cancellation/work-limit controls, disposal, diagnostics, exact output,
and source immutability. The wire-only proxy reflection thrown-object identity
case remains unqualified because the thrown object cannot cross the JSON wire.
The focused Rust core-wire tests passed 2/2. Fresh Node addon SHA-256: `162bf7d4bfc91e5e55ba7300af3fd28af85751f50f798ad4cfd015130635f222`; WASM binary SHA-256: `039ef9ae576b1b568e57ec946f8d0415a116b1eacc1e0f3f18cc3dcde92419cd`; WASM glue SHA-256: `f242eb8fa149d66c2c059f7d28c78d40ce8cbf5af3f6b14762843e75e4a42132`.

This is opt-in Arrow schema JSON evidence only. It does not select default
routing or qualify native Apache Arrow, IPC, array data, PyArrow, Python/CLI
Arrow operations, package release, or the complete Rust port. See
[source-manifest.json](source-manifest.json) for exact source hashes,
commands, toolchain/platform and private artifact hashes. Host receipts contain
runtime versions, timings, call counts and replay packet hashes. The prior
packet remains available in commit 289fdeb; this refresh adds no historical
copy.
