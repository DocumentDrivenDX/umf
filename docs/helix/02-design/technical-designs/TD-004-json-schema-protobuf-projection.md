---
ddx:
  id: TD-004
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: US-004
      kind: informed_by
---

# TD-004: JSON Schema-to-Protobuf projection

## Approach

Read copied native JSON Schema nodes, require explicit physical bindings and emit
proto3 source. Keep native source meanings in their existing extensions; do not
flatten native integers, presence or unions into new core types. CONTRACT-004 owns
the profile and result schema.

## Components

`src/projections/json-schema-protobuf.ts` walks the native tree, caches generated
message names by source pointer for recursion, records field mappings and issues,
and calls the explicit Protobuf source compiler. Native source import supplies
the target UMF. Full source UMF is retained separately in the projection result.
`spec/projections/` defines the machine-readable result contract.

## Validation

The authored Order example exercises nested messages and referenced definitions.
The constraints example exercises required, bounds, nullability, annotation defaults,
arrays and alternatives. Independent protoc compiles emitted source. Python
jsonschema and protobuf use manually specified expected instance outcomes; they
do not ask the projection implementation to decide correctness. A report mutation
removing required-member loss must fail. Chromium repeats the public operation
with the worker compiler and tests target-only separation.

## Limits and Follow-On Work

The profile does not implement data conversion or complex scope rebasing. Unknown
semantics stay in source with diagnostics; unsupported shapes block. Future profiles
can add wrappers, explicit enforcement bindings or richer numeric domains, each
with independent evidence. FR-3/CONTRACT-040 permit UMF ideals with qualified lossy
mappings. Only native replacement under FR-28 requires semantic equivalence; this
directed lossy mapping cannot establish that separate claim.
