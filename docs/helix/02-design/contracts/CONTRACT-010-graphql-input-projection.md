---
ddx:
  id: CONTRACT-010
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-009
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: US-010
      kind: informed_by
---

# CONTRACT-010: GraphQL input to JSON Schema

`projectGraphqlInputToJsonSchema` maps a selected GraphQL input type expression to
JSON Schema Draft 2020-12. The complete result schema is
`spec/projections/graphql-input-json-schema.schema.json`. It retains source UMF,
explicit policy, input-definition mappings and fidelity issues; successful results
include native JSON Schema and target UMF. This is input-shape projection, not an
operation/response schema, GraphQL execution engine or arbitrary value converter.

## Required Policy and Validation

Callers select `inputType` using GraphQL type syntax, including list/non-null
wrappers, plus document ID, absolute fragment-free schema ID, `list: "array-only"`,
`idEncoding: "string-or-integer"` and loss policy. Unknown policy fields/values fail.
Output types, missing input types, fragments, unsupported AST/profile content and
reached custom scalars block. A custom scalar needs a separate explicit coercion
contract; its name alone cannot establish a JSON representation. Unselected source
semantics remain retained with diagnostics. Strict policy blocks remaining losses.

## Shape and Coercion

Non-null wrappers reject null; nullable references permit null. Object fields are
required only when non-null and lacking a default. A GraphQL default permits omission
but is not inserted by JSON validation; its semantics remain in source with an
`INPUT_DEFAULT` issue. Unknown object keys are rejected. Recursive input objects
reuse native type definitions without unfolding infinitely.

Lists require arrays and preserve item nullability. GraphQL's recursive singleton
list coercion is not executed and is reported as `LIST_COERCION`. Built-in Int uses
signed 32-bit bounds; Float reports host numeric interpretation limits. Boolean
and String retain their input shapes. Enum values become allowed strings. ID accepts
strings/integers with `ID_COERCION` reporting absent integer-to-string coercion and
host precision concerns. OneOf input objects require exactly one present field
whose value is non-null; ordinary nullable fields do not acquire this rule.

Default insertion, variable/argument processing, output selections, resolvers,
directive behavior and native schema identity remain outside target validation.
Target-only import cannot restore the source GraphQL model. Source paths for input
field issues use `/types/<name>/fields/<name>` semantic coordinates; mappings locate
the generated definitions. These coordinates are not core document JSON pointers.

## Evidence

Authored cases exercise recursive inputs, defaults, nullability, enums, lists and
OneOf. GraphQL-core 3.2.12 and Python jsonschema 4.26.0 compare thirteen inputs,
including acceptance differences and changed coerced values. Removing any required
default/list/ID issue fails the negative controls. Three named input types from the
pinned upstream GitHub schema add nine native/target comparisons. This is finite
subset evidence, not all GraphQL inputs or runtime coercion equivalence.
