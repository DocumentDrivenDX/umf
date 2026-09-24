---
ddx:
  id: CONTRACT-012
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-011
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: US-012
      kind: informed_by
---

# CONTRACT-012: OpenAPI to JSON Schema projection

`projectOpenapiToJsonSchema` projects one indexed OpenAPI 3.1/3.2 schema position to
Draft 2020-12 JSON instance constraints. The complete result schema is
`spec/projections/openapi-json-schema.schema.json`, with the UMF core schema as a
referenced dependency. Results retain the copied source, explicit policy, fidelity
issues and source-to-target location mappings. Projected results also carry target
UMF and native JSON Schema; blocked results have no target.

Callers specify target document ID, absolute fragment-free schema ID, source pointer,
optional resource URI and standalone-schema resource classification, `usage: schema-only`
and strict or allow-reported-loss policy. Source must pass its adapter's structural
checks. Indexing requires supplied base identity and known dialects. Unsupported scope,
missing references, dynamic keywords or custom vocabularies/assertion keywords block.

Each reached schema position becomes a target definition. Static references point to
these definitions; nested schema applicators refer to their generated definitions too.
Allocation precedes traversal, retaining recursive structure. Original IDs, dialects
and anchors are replaced by target identity and recorded source mappings. Exact numeric
lexemes survive native rendering. Literal examples/defaults are not treated as schemas.

Standard constraints and annotations are retained. OpenAPI discriminator/XML/external
Docs/example annotations and `x-` extensions remain in source and are omitted with a
reported loss. Read/write direction, format assertions and content decoding are not
implemented; relevant retained annotations receive explicit issues. HTTP operations,
authorization, serialization and default insertion remain outside this projection.
Strict policy therefore blocks this API-to-instance-model change. Unknown assertion
keywords cannot be made safe merely by opting into loss reporting.

Target interpretation diagnostics are included as fidelity issues. Unavailable compilation,
host numeric interpretation or unknown target keywords/dialects block projection. A projected status
means a target representation was produced; it does not assert all validators support
its regexes, numeric precision or annotation behavior. No target-only recovery of the
original OpenAPI description is claimed. Dynamic references, legacy schema dialects,
and request/response projections remain unfinished extension work.

Evidence: authored recursive/external-schema model, ten independently checked instance
vectors against original constraints and both emitted/round-tripped targets, three
missing-report controls, six pinned official Tic Tac Toe components with twelve native
comparisons, and an actual Chromium public-API check. Python jsonschema evaluates the
source JSON constraints; this is not an independent HTTP runtime oracle.
