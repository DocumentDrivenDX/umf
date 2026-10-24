---
ddx:
  id: umf.evidence.r5-json-schema-bindings.predecessor
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-002
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# R5 JSON Schema binding predecessor freeze

This packet freezes the TypeScript behavior that the opt-in R5 host dispatcher
must expose for seven operations: `importJsonSchema`, `inspectJsonSchema`,
`exportJsonSchema`, `exportJsonSchemaResources`, `exportJsonSchemaBundle`,
`getJsonSchemaNode` and `walkJsonSchema`. It is predecessor evidence only; it
does not establish Rust or binding parity.

`predecessor.json` stores the recorded inputs and exact returned or thrown
outcome for 30 focused calls. The harness supplies options omitted from a few
surrogate-key input summaries, so replay those through the capture script. The
packet includes URI and source refusal ordering, invalid UMF and
extension versions, URI collision, import resource order, exact unsafe-number
and `-0.000` token lookup/export, literal lone-surrogate UTF-16 key access, the
escaped surrogate diagnostic case, unknown native keywords versus unknown
tagged representation fields, lookup/walk resource exclusions, schema-position
walk exclusions for default/enum/const/examples data, and mutations of copied
get/bundle/walk outputs. Diagnostic arrays and `UmfError` code/message strings
are retained as emitted by the public TypeScript API.

The source closure uses the TypeScript 5.9.3 compiler API through
`typescript-api`: AST import/export traversal and the repository's parsed
`tsconfig.json` module-resolution rules. It hashes recursively reached
repository files and records edge count and closure method. `package.json` and
`bun.lock` are hashed separately, as is the capture harness itself. This includes registry, generated validation,
policy, constraint, parser and exact-number helpers reachable from the adapter.
Non-literal dynamic imports, runtime-computed `require()` calls, and bare
package implementation files are excluded; the package manifests identify the
external dependency set. The capture was made with Bun 1.4.3. Reproduce it with:

```sh
bun scripts/rust-migration/r5/json-schema-bindings/freeze-predecessor.ts --check
```

The capture is a targeted fixture set, not a census of every input, refusal,
limit, or adapter behavior. `parseNativeJson`, editing, registry callback
behavior, the upstream Draft 2020-12 corpus, Rust parity, and any installed or
browser binding are outside this packet. The inherited contract and corpus
receipts remain unchanged.
