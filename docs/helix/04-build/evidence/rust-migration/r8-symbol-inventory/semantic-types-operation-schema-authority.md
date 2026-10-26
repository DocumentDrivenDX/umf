---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.semantic-types-operation-schema-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
---

# Semantic-types operation schema authority

CONTRACT-078, “Published schemas,” explicitly names
`spec/core/semantic-types-operation.schema.json` as a published core schema.
The file was directly added in
`f397e484727cc7405958c9ec40468cf6134e48e3` with SHA-256
`3480029b4a635057a714da5c7eba26f669e84b6ea5f1ed852c63fd4f90558ea7`.
Commit `8706814a9605d7325eef32a5df3d05696de00b62` changed its source
reference and legacy-result branches; the current bytes match that revision at
SHA-256 `021935d916e82ea471500dffadf2830469c782b28382d71aeea195df724fe727`.
The authored version history and the named governing contract support an
`authored-authority-known` source classification for this exact 2.0.0 schema.

The present metamodel manifest does not list this path as an output, and no
current writer for the file appears in `scripts/` or `crates/`. The import in
`src/model/semantic-types-receipts.ts`, the Rust `include_str!` in
`crates/umf-core/src/core_semantic_types.rs`, and the root export in
`src/index.ts` establish consumers, not a generator. The R8 ledger pins the
governing contract, current schema, consumers, test, and SDK build/archive
source paths separately. This finding establishes source authority only; SDK
archive bytes, installed bytes, public route behavior, and Rust equivalence
remain distinct qualification gates.
