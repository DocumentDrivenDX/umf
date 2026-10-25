---
ddx:
  id: umf.evidence.rust-migration.r8-domain-pack-resource-authority
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
    - id: CONTRACT-052
      kind: informed_by
---

# R8 domain-pack resource authority

This family covers the domain-pack and dataset-source package/schema JSON pairs.
CONTRACT-052 governs both extensions and identifies the dataset-source
structural schema. `scripts/domain-pack-schema.ts` generates all four resources:
it calls `generateDomainPackSchema()` and `generateDatasetSourceSchema()` and
serializes the corresponding package manifests. The exact semantic inputs are
`src/domain-packs/schema.ts` and `src/domain-packs/source-schema.ts`. The
ledger pins those inputs, the generator, the contract, the public re-export and
the SDK build/archive paths.

| Generated resource | SHA-256 |
| --- | --- |
| `spec/extensions/domain-pack/schema.json` | `e34054015eae699987d7fd0640bdbc17906b129fa46b2c5770753ebf0723931e` |
| `spec/extensions/domain-pack/package.json` | `e659ba01883a7114d5b38b81cc1fac0717fa0b36a69731747620a67007dcb0e9` |
| `spec/extensions/dataset-source/schema.json` | `385f12f3b643f86838cb2b9baec60d85cbac1e3e543ffd015105465fa1ccbc95` |
| `spec/extensions/dataset-source/package.json` | `c86ec3d083fc518f8d0e3c4246eca2024e61cae0ba6cd46d7997389421fcd1bf` |

The focused gap-ledger test verifies the authority classification, exact
generator and schema-builder inputs, source hashes, contract/build closure
hashes, public package paths and `dist/spec/` archive path. The generator's
own `--check` mode passed for all four outputs. This qualifies reproducible
source generation and source package rules, not installed archive bytes or a
release artifact.

Validation: `bun scripts/domain-pack-schema.ts --check` passed;
`node scripts/rust-migration/r8/gap-ledger.mjs --check` passed; the focused R8
gap-ledger suite passed 10/10 tests. Ledger SHA-256:
`6d0803d2d80392372e3863d39c2d9b4e585686934e55a2772e2fc4a9e7d9538d`.
Resource-authority counts are 14 generated-known, 13 authored-known, 109
candidate-generated, and 62 unresolved aliases.
