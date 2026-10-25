---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.typespec-schema-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-013
      kind: informed_by
    - id: US-013
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 TypeSpec schema authority checkpoint

## Scope and finding

CONTRACT-013 directly names the four result schemas for the pinned TypeSpec
source adapter and the complete result schema for its materialized JSON Schema
projection. US-013 acceptance criteria define the corresponding source,
compiler, semantic graph, native emission, and projection boundaries. The R8
ledger therefore records all five as authored normative contract schemas:

| Resource | Versioned `$id` | US-013 clauses |
| --- | --- | --- |
| `spec/extensions/typespec/syntax-locations.schema.json` | `urn:umf:typespec:syntax-locations:0.1.0` | AC1 |
| `spec/extensions/typespec/compiler-report.schema.json` | `urn:umf:typespec:compiler-report:0.1.0` | AC1 |
| `spec/extensions/typespec/semantic-graph.schema.json` | `urn:umf:typespec:semantic-graph:0.1.0` | AC5, AC6 |
| `spec/extensions/typespec/json-schema-emission.schema.json` | `urn:umf:typespec:json-schema-emission:0.1.0` | AC12, AC13 |
| `spec/projections/typespec-json-schema.schema.json` | `urn:umf:projection:typespec-json-schema:0.1.0` | AC15, AC16 |

The source review found no exact writer for these five schema bytes. The
TypeSpec standard-library and registered-library scripts generate their own
distinct bundled resources; they do not produce these result contracts. Each
schema is exported from `src/index.ts`, consumed by its corresponding adapter
or projection implementation, and checked by its focused TypeSpec tests. The
ledger pins these consumers, CONTRACT-013, US-013, and SDK build/archive rules.

## Limits

This is a source-authority classification, not execution or semantic
qualification. In particular, the schemas describe bounded operation results;
they do not claim complete TypeSpec compiler-state interchange, TypeSpec-to-JSON
Schema fidelity, or stable graph IDs. CONTRACT-013 records known emitter numeric
loss and omitted int64/uint64 bounds, while the projection remains explicitly
incomplete.

The schemas are copied as package data under the SDK build rule. This ledger
entry does not qualify production archive bytes or any installed SDK resource,
and it makes no default-route retirement claim. No exact generated schema
writer or Git-history dependency is asserted. The shared inventory and ledger
snapshot were not regenerated in this tranche.

Focused verification:

```sh
node --test --test-name-pattern='TypeSpec result and projection schemas pin CONTRACT-013' scripts/rust-migration/r8/gap-ledger.test.mjs
```

The test checks all five exact IDs, governing clauses, exact source consumers,
hash-pinned contract/build closure, and `not-installed-qualified` archive
status. It also requires the ledger to leave each resource with authored
authority and no inferred generator.
