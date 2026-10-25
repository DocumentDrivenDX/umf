---
ddx:
  id: umf.evidence.rust-migration.r8-tablespec-cardinality-resource-authority
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TD-042
      kind: informed_by
    - id: US-042
      kind: informed_by
---

# R8 TableSpec Cardinality projection-schema authority

`scripts/core-ideals/cardinality-tablespec-projection-schema.ts` is the direct,
single-output Bun writer for
`spec/core/cardinality-tablespec-projection.schema.json`. It imports
`spec/core/field-tablespec-projection.schema.json`, clones its Field projection
shape and specializes the Cardinality operation, request and receipt schema.
This authority is pinned separately from the imported base: the base has its
own exact writer authority. The ledger does not infer authority transitively.

The mapping cites CONTRACT-040, TD-042, and US-042 AC3–5. Its source closure
hashes the direct base input, runtime consumer, focused projection test,
`src/index.ts`, SDK build and archive script. The runtime module exports the
schema and the public TypeScript root re-exports that module. The
`package/dist/spec/core/` path establishes source packaging closure only; no
installed package bytes or current Cardinality acceptance is claimed.

The writer's `--check` compares the deterministic JSON rendering with the
existing output and performs no writes. A focused negative control copies the
writer and input into an isolated temporary project, corrupts the output, and
confirms check mode refuses it. The projection test passes 2/2 (413
assertions), the complete R8 ledger suite passes 23/23, and writer and ledger
checks pass.

At this moving-source checkpoint, the ledger records 30
`generated-authority-known`, 13 `authored-authority-known`, 93
`candidate-generated`, and 62 `authority-unresolved` resource authorities.
Its SHA-256 is
`35dff9ecfd47e70be2311412a45e0dd1319a087c1fcc6311cfe928a964a9dc72`. The
writer hash is
`4e0e402c3b887251ac1063af21feab3a9121be7808f9f8043700c9ef8bca78ed`, output
hash `de0e9a95d76eb22f36ca511e0b8fa24bfcba371b17df82d8e0693dfc693a65c2`,
ledger generator hash `fa28c4988d4899cf7b21115bb20b32fc19b5e4a42fbe3168109a129ae4aaebf6`,
and focused ledger test hash
`4cdcf8b44a578e0e3da93e4eacbedd1c5711a4d479da225d2dd4cc713cfd66b1`.

The 922 logical executable retirement gaps, `./reference`, installed release
qualification, and final shared-source recapture remain open.
