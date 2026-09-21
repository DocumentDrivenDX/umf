---
ddx:
  id: CONTRACT-004
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: US-004
      kind: informed_by
---

# CONTRACT-004: JSON Schema-to-Protobuf projection

**Profile:** 0.1.0. **Source:** JSON Schema Draft 2020-12. **Target:** proto3.

## Purpose and Scope

Lower an explicitly typed object schema into a native Protobuf message while
preserving the full source and reporting target limitations. This does not convert
application instances. Field mappings document correspondence; target wire and
ProtoJSON encodings still require an explicit data-conversion implementation.
No source concept is promoted into core by this projection.

## Operation and Bindings

`projectJsonSchemaToProtobuf(source,options,compiler)` returns a promise of the
result defined by `spec/projections/json-schema-protobuf.schema.json`.
Options require `id`, `packageName`, `messageName`, `fields`, `integerType` and
`lossPolicy`. `fields` maps source JSON Pointers to `{number}`; numbers must be
valid, nonreserved Protobuf tags, distinct within each generated message. Missing,
conflicting or unused bindings block projection. Generated field names are
`field_<number>`; native `json_name` records the source property spelling.

`integerType` explicitly selects int64, uint64, sint64, int32, uint32 or sint32.
There is no inferred enterprise numeric type. `lossPolicy` is required: `strict`
blocks if any issue remains; `allow-reported-loss` permits disclosed approximations
but still blocks unsupported shape/scope choices. The current object profile
always reports native representation differences, so strict mode acts as a refusal
to perform this lossy projection. No approval prompt is required to choose a policy.

## Supported Shape Rules

The root must explicitly declare object type. Supported properties are objects,
strings, booleans, integers, numbers and homogeneous arrays. Native scalar fields
and message fields are proto3 optional; arrays become repeated fields. JSON numbers
map to double with an explicit domain warning. Nullable single-type combinations
retain the non-null carrier and report distinct null as unrepresented.

Root-document JSON Pointer references to object definitions become message
references, including recursion. Nested resource identities, external/anchor
references, ambiguous multiple types, boolean schemas and nested arrays without
wrapper bindings block. Unknown dialect/vocabulary semantics block interpretation.
Object definitions not referenced remain only in source and are reported.

Constraints on a supported carrier are not silently assumed to be enforced by
Protobuf: bounds, lengths, patterns, enum/const, oneOf and other applicators receive
keyword-specific report paths. A carrier-less alternative cannot be guessed.
Unrecognized keywords are retained with source interpretation diagnostics.

## Result and Error Semantics

The result contains `status`, a copied `source`, the exact `policy`, `issues` and
`mappings`. Each issue has path, code, classification, detail and
`retainedInSource:true`. Classifications are representation-change, not-enforced,
unsupported and annotation-only. Mappings record source path, target message,
target field and field number.

A projected result also contains `nativeSource`, compiled target UMF and target
validation diagnostics. The target carries its own Protobuf semantics; source
JSON Schema is not merged into it. A blocked result has no target. A compiler
failure becomes a blocked result with its error; candidate native source may
remain for inspection. Malformed options or invalid source documents throw.

Required-member assertions do not become proto3 enforcement. Repeated fields
collapse absent/empty collections. Protobuf integer widths, UTF-8 string domains,
non-finite double values and 64-bit ProtoJSON strings differ from JSON instance
semantics. JSON Schema defaults remain annotations and never become Protobuf getter
defaults. Unknown native wire fields are not equivalent to JSON object openness.
Source annotations, URI identities and unused definitions stay in retained source.

## Recovery and Evidence

Return to JSON Schema uses retained `source`. Reimporting target-only descriptors
cannot recover source validation constraints and must not receive hidden source
metadata during the test. Native protoc independently compiles targets; Python
jsonschema and protobuf evaluate explicitly authored instance correspondences.
The oracle requires every observed mismatch to have its expected disclosure and
fails when a required issue is removed. The target report's structural schema is
not itself proof of disclosure completeness.

Fixtures, known outcomes and scope are in `fixtures/projections/`. Source layout,
data conversion, arbitrary reference rebasing and universal equivalence are outside
this first profile. The extension goal continues beyond this bounded spike.
