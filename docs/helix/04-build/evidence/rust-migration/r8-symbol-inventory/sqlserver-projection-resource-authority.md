---
ddx:
  id: umf.evidence.rust-migration.r8-sqlserver-projection-resource-authority
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
    - id: CONTRACT-031
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TD-040
      kind: informed_by
    - id: TD-042
      kind: informed_by
    - id: US-031
      kind: informed_by
    - id: US-040
      kind: informed_by
    - id: US-042
      kind: informed_by
---

# R8 SQL Server projection-schema resource authority

This checkpoint resolves two exact, single-output schema writers. The Field
writer reads the independently pinned PostgreSQL Field projection schema,
applies the SQL Server carrier and binding shape, and writes only
`spec/core/field-sqlserver-projection.schema.json`. The Cardinality writer
imports that SQL Server Field schema, adds the Cardinality request/result
shape, and writes only
`spec/core/cardinality-sqlserver-projection.schema.json`. Each chain is pinned
separately; Cardinality authority is not inferred transitively from a filename.

The ledger records CONTRACT-040, the matching Field/Cardinality technical
design and story, plus CONTRACT-031's projection/loss criterion
(US-031-AC5). It hashes each direct writer input, shared policy helper where
used, runtime consumer, focused test, `src/index.ts`, SDK build, and archive
script. Both consumers export their schema and are re-exported from the public
TypeScript root. The source route maps to `package/dist/spec/core/`; this is
package-build/archive closure only and does not qualify installed archive bytes
or default-runtime behavior. The Cardinality design retains an
acceptance-pending qualification, which this authority record does not upgrade.

Both writers have read-only `--check` modes. The focused ledger test verifies
the output bytes are unchanged by checks and copies the minimal writer inputs
into a temporary project, corrupts each output, and confirms each check rejects
the stale bytes. The linked Field and Cardinality projection tests pass 4/4
(616 assertions); the ledger suite passes 21/21. Both writer checks, ledger
`--check`, and `git diff --check` pass.

At this moving-source checkpoint the ledger records 29
`generated-authority-known`, 13 `authored-authority-known`, 94
`candidate-generated`, and 62 `authority-unresolved` resource authorities.
Its final moving-source checkpoint SHA-256 is
`2ee334e526732df808618bb7e9fde823a2fc089ac201d8670d5c8eba3f540013`. A
source change between the first capture and final check made the first ledger
check stale; after recapturing, the final `--check` passed. The
writers hash to
`65e5f49196e6c5a707667f3b1ae469c770a47b8e460d0db732028714f1d6af84` (Field)
and `8cf36373fa8cea4b6c04c70b7b02d10730c7e2357d9a0f5bdf566b151789cc9c`
(Cardinality); schema outputs hash to
`b22a85649b77ac1402b000c41e422865483d6f1951a1417c48dd9b73418e070a` and
`64f10b65117c98db2334262d78949f9a7b8bc55f3512026b8acd5beb2cb38bcb`.
Ledger generator and focused test hashes are
`737f49ffa01e5029959e5938193aa13bdde1abf6f7f90176ded3751046e1de6f` and
`aa2c882d5b20424ae036ed033fbd8d5fd0f6ebf81fc54911223ff44e9e811b00`.

The 922 logical executable retirement gaps, `./reference`, installed release
qualification, and final shared-source ledger recapture remain open.
