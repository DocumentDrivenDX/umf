---
ddx:
  id: CONTRACT-008
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: US-008
      kind: informed_by
---

# CONTRACT-008: Avro to JSON document schema

`projectAvroToJsonSchema` projects the interpreted Avro 1.12.0 schema subset into
JSON Schema Draft 2020-12. The result contract is
`spec/projections/avro-json-schema.schema.json`. Every result retains the copied
source, explicit policy, named-type mappings and fidelity issues. Successful
results also contain a target UMF and native JSON Schema. Target-only reimport
cannot reconstruct the Avro schema.

## Required Binding

The caller supplies document ID, absolute fragment-free schema ID, `long:
"decimal-string"`, `bytes: "hex-string"`, `union: "untagged"` and a loss policy.
Unknown policy fields or unsupported values fail. This is a document encoding
choice, not Avro's native JSON encoding or an instance converter.

Records become closed objects with every writer field required, including fields
with defaults. Defaults remain source-owned reader-resolution rules. Named types
map to deterministic definitions with qualified-name mappings; recursion and explicit
ordered dependencies resolve without flattening native source artifacts. Enum
symbols become allowed strings; fixed bytes become hexadecimal strings of exact
length. Arrays/maps retain item/value schemas. Int bounds are enforced. Long strings
retain arbitrary integer precision but do not enforce signed 64-bit bounds. Floating
schemas do not enforce binary32 rounding, and JSON excludes non-finite values.

Untagged unions use `anyOf`; branch identity/order and ambiguous branch recovery
are explicitly lost. Logical types project underlying carriers while reporting
unenforced logical meaning, units, precision and scale. Custom metadata survives
in retained source with incomplete-interpretation issues. Native names, aliases,
sort order, binary encodings and reader/writer resolution are not restored by
JSON shape validation. No default insertion is implied.

## Gates and Fidelity

Invalid UMF throws. Native validator failures, unresolved names, unknown encoding
fields, unsafe host-number interpretation and unsupported source constructs block.
Strict policy blocks whenever issues remain. Allow-reported-loss projects only
when no structural blocker remains, returning every known gap. Generated schema
must validate through the JSON Schema extension. The retained source is separate
from target-only recovery evidence.

Tests cover the original Order, recursive instances, explicit dependencies, invalid
shapes and encoded values, strict rejection and independent native comparison.
A long just above the signed 64-bit maximum fails Avro but passes the target string
pattern; the test requires `LONG_ENCODING` at that source field. Removing the issue
makes the fidelity check fail. These finite cases do not establish full cross-format
equivalence. See the [Avro specification](https://avro.apache.org/docs/1.12.0/specification/)
for native defaults, named types and encoding semantics.
