---
ddx:
  id: TD-006
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: US-006
      kind: informed_by
---

# TD-006: DDD document projection

## Approach

Read validated domain definitions and explicit physical bindings. Cache target
schemas by qualified concept and embed/identity mode. Generate local JSON Schema
references without merging contexts or rewriting DDD source. CONTRACT-006 owns
encoding choices and diagnostic obligations.

## Components and Validation

`src/projections/ddd-json-schema.ts` implements the projection and report.
`spec/projections/ddd-json-schema.schema.json` defines its result structure.
The existing native JSON Schema adapter checks and packages the target. Tests
validate document instances independently with Ajv and exercise missing/unused
bindings, identity scope and policy changes. Browser checks use the authored sales
model and confirm source retention and aggregate-enforcement disclosure.

## Limits

This first profile does not resolve object instances, uniqueness or lifecycle.
Decimal and byte strings are physical encodings, not new core semantic types.
Recursive schema generation does not imply cyclic JSON instance support. Future
bindings can add owner-qualified references or enforcement adapters only with
separate meaning and evidence. No type promotion follows from this lossy lowering.
