---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.dataset-value-schema-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 dataset-value operation schema authority checkpoint

## Scope and finding

This checkpoint establishes direct authorship for the two current dataset-value
operation schemas. CONTRACT-049 identifies the versioned structural authority
for the full supplied-dataset operation and its public schema export.
CONTRACT-056 states that the compact operation schema owns its versioned
request/result shape and names its public schema export. The exact schema files
were introduced in the same commits as their governing contracts and operation
implementations, then updated in the metamodel-current-definition change.
There is no executable schema writer for either exact file; nearby validation
and freeze scripts consume or test the resources but do not generate them.

| Resource | `$id` | Governing contract | Added blob SHA-256 | Current-definition blob SHA-256 |
| --- | --- | --- | --- | --- |
| `spec/core/dataset-value-operation.schema.json` | `urn:umf:core:dataset-value-operation:1.0.0` | CONTRACT-049 | `913b25afb079d6952e31006ee4a772e77b67461d9029f8cccda24dd4ce017b7a` | `217cc3c05e10cec1bb4e93cca1205c039f596e95080cba075823a9b8b351013d` |
| `spec/core/dataset-value-compact-operation.schema.json` | `urn:umf:core:dataset-value-compact-operation:1.0.0` | CONTRACT-056 | `b113553c04e1c25eeb5f19da0879d8273c1e34ed515126d751bc812424843caf` | `89f502aa0cea1a75fba2ff586c795c875a980b96af3e01d3117538e9fe12e74e` |

The full schema was added by `c7c95e1c4ea5b72541f47fa0350ca467ff02f395`
(`Validate finite core datasets with original Record key and relationship
receipts`); the compact schema was added by
`a95c3ec18a8f904decde884a4fa252988d2a5b0f` (`Add compact finite dataset
receipts with bounded shared validation`). Both current resources were updated
by `8706814a9` (`Generate current UMF definitions from the authoritative
metamodel`). The ledger records these commit identifiers and fixed blob hashes
as evidence metadata. Normal ledger generation does not query repository
history, so a shallow checkout remains supported.

## Source and route closure

The ledger hashes each exact schema, governing contract, direct runtime
consumers, `src/index.ts`, and the TypeScript build and SDK archive rules.
Full-operation consumers include `src/model/dataset-values.ts`,
`src/model/evolution.ts`, and `src/model/internal/schema-work.ts`. Compact
consumers include `src/model/dataset-values-compact.ts` and the shared schema
work module. `src/index.ts` exports
`coreDatasetValueOperationSchema` and
`coreDatasetValueCompactOperationSchema`; focused tests exercise the resource
rows, exports, schema work imports, package-data rule, and authored revision
pins.

The SDK build copies `spec/` into `dist/spec`, and the Python archive builder
includes files under `dist`. This is source/build-rule evidence only. It does
not qualify bytes in a produced archive or installed package; both resources
remain `not-installed-qualified`. This checkpoint does not establish a Rust
implementation or runtime equivalence for either operation, and it does not
promote older or related dataset schemas.
