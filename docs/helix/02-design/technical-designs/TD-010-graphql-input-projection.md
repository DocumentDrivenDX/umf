---
ddx:
  id: TD-010
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-010
      kind: informed_by
    - id: US-010
      kind: informed_by
---

# TD-010: GraphQL input document projection

Build the validated native schema so type extensions and references resolve under
GraphQL rules. Parse the selected type expression and require an input type.
Translate non-null/list wrappers recursively; allocate named input definitions before
visiting fields so recursive references terminate. Preserve default presence using
the GraphQL.js default descriptor, without evaluating or copying it into misleading
JSON default annotations. OneOf adds exactly-one-property and selected-value non-null
constraints to the otherwise closed input object.

Report absent default insertion and scalar/list coercion separately from validation
shape. Reached custom scalars block until a representation contract exists. Source
operations, output types and runtime behavior remain source-owned. Validate the
result contract and generated native schema independently of source retention.

Bun/Ajv tests cover shape; Python GraphQL-core and jsonschema compare thirteen
coercion/validation vectors and three missing-report controls. Three pinned upstream
mutation input examples add nine comparisons. Browser checks call the bundled public
API. This design intentionally does not claim runtime instance conversion.
