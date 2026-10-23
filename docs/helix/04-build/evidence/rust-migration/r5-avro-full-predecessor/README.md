# R5 full Avro adapter TypeScript predecessor

This additive packet freezes the current TypeScript adapter boundary as
`r5-avro-full-predecessor/1.0.0`. It supplements the metadata-only
[`r5-avro-fields`](../r5-avro-fields/README.md) packet and does not claim full
Avro qualification. The governing contracts are
[CONTRACT-007](../../../../02-design/contracts/CONTRACT-007-avro.md) and
[CONTRACT-008](../../../../02-design/contracts/CONTRACT-008-avro-document-projection.md).

`outcomes.json` records exact TypeScript output for import, export, inspect,
get-node, candidate edits and bundle export, plus stable error names/messages,
source hashes and runtime versions. The representative Avro 1.12.0 input includes
a named dependency, nested source-owned metadata, a decimal logical type, a
custom field attribute, an escaped JSON Pointer member and field metadata.
The candidate report is snapshotted in full before isolation mutations and
contains an unrelated, version-declared UMF extension in both source and
proposed documents.

The captured boundary shows these behaviors:

- Import stores an ordered tagged JSON tree, preserving object-member order,
  exact number tokens, nested native metadata and dependency artifact IDs.
- `inspectAvro` reports logical and unknown native metadata as warnings and
  leaves the result incomplete. Its `avsc` schema interpreter registers
  dependencies in order; no file or URL lookup occurs.
- Root-only export refuses a document with dependencies. Bundle export returns
  the root, ordered dependencies, copied source UMF, and a source-artifact
  diagnostic. Native custom attributes survive; unknown tagged-representation
  members are reported and block root-only export, bundle export and node
  proposals. The unknown-representation export cases use a root-only source, so
  the refusal is not masked by the separate dependency refusal.
- `getAvroNode` uses RFC 6901 escaping (`~1`, then `~0`) and returns a detached
  copy. Missing dependencies and pointers are refused. Candidate edits return a
  copied source, proposed document, replacement tree, path and validation;
  unresolved or incomplete native interpretation may still be represented as a
  candidate. The conservative edit operation instead refuses when the existing
  completeness guard is unmet.
- Proposal refusal precedence observed here is stale materialized field
  metadata, then payload/representation validity, then the unknown tagged-tree
  guard, pointer parsing and path lookup, replacement parsing, and finally
  attached field-metadata reassociation/removal guards. In particular, an
  unknown tagged member wins over a missing edit path, and stale core field
  metadata wins before path resolution.
- JSON and YAML serialization preserve the UMF document and Avro JSON values;
  whitespace and JSON string escape spelling are formatting, not retained source
  bytes. Returned node, bundle-source and proposal objects are isolated copies.

For the exact JSON text int64 case, import, tagged-tree read, inspect and both
JSON/YAML document serialization round trips preserve token
`9223372036854775807` exactly in `outcomes.json`, alongside `AVRO_NUMERIC`
diagnostics before and after serialization. `avsc` 5.7.9 accepts the
representative schema but refuses the exact int64 default after `JSON.parse`
rounds it to `9223372036854776000`; this records the host-number validator limit,
not adapter loss. The pinned Apache Avro 1.12.0 Python module is not installed in
this worktree environment, and its Java artifact is unavailable, so this packet
does not claim a fresh Apache-native replay. Existing Apache Avro 1.12.0 corpus
and behavior evidence remains in the other scoped Avro records.

The source custom-field attribute is at `/root/fields/0/type/customFieldTag`;
its export observation reads `fields[0].type.customFieldTag`.

The current public operations are synchronous and expose no cancellation,
resource-budget or deadline controls, so those controls are not applicable at
this TypeScript boundary. This packet records no datum codec behavior. Protocol,
IDL and object-container support, complete Avro 1.12 semantics, Rust parity,
browser operations beyond existing separate evidence, and default host cutover
remain open.

Reproduce the TypeScript and pinned `avsc` capture from the repository root:

```sh
bun docs/helix/04-build/evidence/rust-migration/r5-avro-full-predecessor/capture.ts
bun test tests/avro/native.test.ts --test-name-pattern='AC2|AC3'
```

`capture.ts` rewrites only this packet's `outcomes.json`. Its source fingerprints
are snapshots of the 11 implementation, serialization, validator, package and
contract inputs listed in that JSON record. The focused TypeScript adapter tests
replay exact-number retention, copy isolation, and unknown tagged-representation
refusal; they are not a general conformance suite. The `AC1` test also writes a
round-trip fixture, so the scoped command above leaves it filtered out.
