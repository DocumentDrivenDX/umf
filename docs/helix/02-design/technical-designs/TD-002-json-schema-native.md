---
ddx:
  id: TD-002
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: US-002
      kind: informed_by
---

# TD-002: JSON Schema native adapter

## Approach

Encode native JSON as a recursive tagged tree owned by `umf.json-schema` 0.1.0.
Parse numeric tokens from the syntax tree before JavaScript conversion can round
them. Preserve keywords, identifiers and resources in their native positions.
CONTRACT-002 owns normative interfaces and bounds; no concept is promoted to core.

## Components and Operations

`src/adapters/json-schema/tree.ts` handles parsing, emission and pointer traversal.
`index.ts` builds the envelope, inspects native semantics with pinned Ajv, exposes
copied nodes and schema-position traversal, and delegates atomic edits to core.
`spec/extensions/json-schema/` defines the complete payload and package schemas.
Bundle export includes diagnostics, resources and the source UMF document because
native JSON Schema cannot carry every unrelated UMF vocabulary.

## Validation

Bun regenerates all required upstream round trips before the Python oracle runs.
Ajv and Python jsonschema separately compare original expected vectors against
source and emitted schemas. Python uses exact Decimal decoding, mathematical
integer recognition, Fraction multipleOf and explicit custom-metaschema validation
vocabulary selection. This profile and both validators' failures are published.
Coverage requires one passing independent oracle per complete case; parity alone
is insufficient. Manifest hashes pin upstream inputs and their license.

The native suite covers unsafe edits and unknown representation fields. Browser
checks execute the compiled ESM API. Tools and Python stay outside portable source.

## Risks and Limits

Ajv has observed dynamic-reference, unevaluated-keyword and prototype-name limits;
the inspector reports affected schemas as incomplete. Exact native numbers can
round-trip even when installed JavaScript validation cannot interpret them safely.
Optional upstream cases, other dialects, strict CSP and universal semantic equivalence
are not established. Preserve source artifacts through subsequent version changes.
