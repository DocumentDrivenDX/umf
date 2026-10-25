---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.domain-projection-schema-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: CONTRACT-015
      kind: informed_by
    - id: CONTRACT-076
      kind: informed_by
    - id: US-006
      kind: informed_by
    - id: US-015
      kind: informed_by
    - id: SD-005
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 DDD, Bit128 and PostgreSQL projection-schema authority checkpoint

## Scope and findings

The three files are directly named by their governing contracts. Source search
found no exact schema writer for any of them; their projection implementations
do not generate the checked-in result-schema artifacts.

| Resource | Versioned `$id` | Governing authority |
| --- | --- | --- |
| `spec/projections/ddd-json-schema.schema.json` | `urn:umf:projection:ddd-json-schema:0.1.0` | CONTRACT-006; US-006 AC1/AC3 |
| `spec/projections/bit128-model.schema.json` | `urn:umf:projection:bit128-model:1.0.0` | CONTRACT-076, “Model composition profile — uuid-model1”; SD-005 |
| `spec/projections/postgresql-row-json-schema.schema.json` | `urn:umf:projection:postgresql-row-json-schema:0.1.0` | CONTRACT-015; US-015 AC9 |

The Bit128 schema's profile-specific contract names the exact file and result
shape, but does not link a user-story artifact for this operation. The ledger
does not invent a story criterion; authority is pinned to CONTRACT-076 and its
linked SD-005 design section.

Consumer relationships differ by resource. `src/projections/bit128-model.ts`
directly imports and validates against its schema. The DDD implementation
constructs the operation result without importing the schema; the focused test
imports the schema directly for report validation, and `src/index.ts` exports
it. The PostgreSQL row implementation likewise constructs the report without
importing the schema; its focused test validates results using the schema
exported by `src/index.ts`. The ledger pins these distinctions rather than
labeling all three schemas as runtime imports.

## Limits

These entries establish authored schema authority and source/build/archive
closure, not full projection equivalence or installed bytes. The schemas are
copied under the SDK build rule. SDK archive routes remain
`not-installed-qualified`; no default route or declaration is retired. The
shared inventory and ledger snapshot were not regenerated in this tranche.

Focused verification:

```sh
node --test --test-name-pattern='three named DDD, Bit128 and PostgreSQL projection schemas' scripts/rust-migration/r8/gap-ledger.test.mjs
```

The test checks exact schema IDs, governing artifacts/clauses, the Bit128
direct runtime import, DDD's direct test import, the PostgreSQL package-export
test use, hash-pinned closure, and the unqualified SDK archive status.
