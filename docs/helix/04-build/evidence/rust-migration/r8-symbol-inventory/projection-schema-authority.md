---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.projection-schema-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-008
      kind: informed_by
    - id: CONTRACT-010
      kind: informed_by
    - id: US-004
      kind: informed_by
    - id: US-008
      kind: informed_by
    - id: US-010
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 JSON Schema projection result-schema authority checkpoint

## Scope and finding

Three projection result schemas were unresolved in the R8 resource census.
Each governing contract names its exact schema path as the operation's result
contract; the linked story defines the tested behavior. The source review found
no exact writer for these schema bytes. Each is authored normative contract
data, exported from `src/index.ts` and consumed by its projection and focused
test:

| Resource | Versioned `$id` | Authority and acceptance |
| --- | --- | --- |
| `spec/projections/avro-json-schema.schema.json` | `urn:umf:projection:avro-json-schema:0.1.0` | CONTRACT-008; US-008 AC1/AC2 |
| `spec/projections/graphql-input-json-schema.schema.json` | `urn:umf:projection:graphql-input-json-schema:0.1.0` | CONTRACT-010; US-010 AC1–AC3 |
| `spec/projections/json-schema-protobuf.schema.json` | `urn:umf:projection:json-schema-protobuf:0.1.0` | CONTRACT-004; US-004 AC1/AC2/AC4 |

The ledger records the exact contract, story, runtime projection module, test,
TypeScript export and SDK build/archive closure for each path. It does not
infer a schema writer from adjacent projection code or fixtures.

## Limits

This classification establishes schema authority and current source ownership.
It does not establish semantic equivalence of a projection, complete behavior
across all source shapes, or installed distribution contents. The package
build copies `spec/` data; all three SDK archive routes remain
`not-installed-qualified`, and no default route or declaration is retired.
The shared R8 inventory and ledger were not regenerated in this tranche.

Focused verification:

```sh
node --test --test-name-pattern='three named projection contracts pin authored result schemas' scripts/rust-migration/r8/gap-ledger.test.mjs
```

The regression checks the exact IDs, respective contracts/stories/acceptance
clauses, runtime/test consumers, source/build/archive closure and the
unqualified installed-archive status. It also asserts that the ledger reports
no generator for any of these resources.
