---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.postgresql-key-catalog-schema-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-015
      kind: informed_by
    - id: US-015
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 PostgreSQL Key catalog schema authority checkpoint

## Scope and finding

This checkpoint resolves generated authority for three schemas emitted by one
exact, self-contained, three-output writer:
`scripts/core-ideals/key-postgresql-catalog-schema.ts`.
`CONTRACT-015` governs PostgreSQL catalog captures; `US-015-AC6` specifies
versioned capture provenance, observed metadata, preservation, and qualified
lookup. These generated schemas cover the bounded PostgreSQL 17 Key observation
and catalog-correlation profile. They do not describe the complete PostgreSQL
catalog capture or general catalog semantics.

| Output | `$id` | First checked-in schema blob | Generator output |
| --- | --- | --- | --- |
| `spec/extensions/postgresql-catalog/key-observations-v1.schema.json` | `urn:umf:postgresql:key-observations:1.0.0` | Commit `5136e8b8228635c85a86ec1ce8cfbd875fe92b15`, SHA-256 `ce18e948e15951c4b6e1c4bb3ded57ad0a6d3ec82a33a9949a24517035e2a0be` | Same bytes at commit `f99ac9fdb59d94875b48fdf40ca21a734185dd5c` and current source |
| `spec/core/postgresql-key-catalog-inspection.schema.json` | `urn:umf:core:postgresql-key-catalog-inspection:1.0.0` | Commit `f99ac9fdb59d94875b48fdf40ca21a734185dd5c`, SHA-256 `200d3555e92f683b18a645094c1dd0b611e977e121d4fecf73a685df7d9ff199` | Same current bytes |
| `spec/core/postgresql-key-catalog-correlation.schema.json` | `urn:umf:core:postgresql-key-catalog-correlation:1.0.0` | Commit `f99ac9fdb59d94875b48fdf40ca21a734185dd5c`, SHA-256 `96e6d77ad1dbc7701b201ffd38e21cf09d0ba24232030a7e366718f8e00e5ba4` | Same current bytes |

The first schema and its writer were added together by the catalog-observation
change; the inspection and correlation outputs were added by the follow-up
correlation change. The ledger keeps normal generation history-independent and
pins the current writer, contract/story, schema consumers, tests, exports, and
SDK build/archive source closure. The focused regression runs the writer in a
temporary tree and byte-compares all three outputs with the checked-in files.
The writer is self-contained and reads no external schema files; its emitted
`urn:umf:native-json:0.1.0` references are a runtime dependency, not generator
input.

## Consumers and limits

The native observations schema is consumed by `src/adapters/postgresql/key-catalog.ts`
and `src/core-ideals/key-postgresql.ts`; the inspection result is consumed by
the adapter; the correlation result is consumed by
`src/adapters/postgresql/key-correlation.ts`. `src/index.ts` re-exports these
adapter surfaces. The focused catalog and correlation tests cover their use.

The build copies these source schemas into `dist/spec` and the archive rule
includes `dist`; this only establishes the current source/build route. There is
no installed archive-byte replay here, so all three resources remain
`not-installed-qualified`. This checkpoint does not claim whole-catalog
coverage, live PostgreSQL execution, native equivalence, or Rust runtime
support.
