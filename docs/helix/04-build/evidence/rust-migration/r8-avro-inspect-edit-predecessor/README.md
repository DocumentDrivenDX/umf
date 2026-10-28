---
ddx:
  id: umf.evidence.rust-migration.r8-avro-inspect-edit-predecessor
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-008
      kind: informed_by
---

# R8 Avro inspector and node-edit TypeScript predecessor

This draft packet freezes the checked-out TypeScript behavior for exactly two
operations: `inspectAvro` and `proposeAvroNodeEdit`. The source implementation
is `src/adapters/avro/index.ts`; the capture records its direct imports, not a
package-root route. It does not select either operation for Rust routing, claim
parity, or authorize retirement of the TypeScript implementation.

The eight observations cover a document with valid structure and unknown Avro
root/field metadata, an unrelated versioned UMF extension, and an exact integer
token beyond JavaScript's safe range; an unresolved native name; malformed UMF
structure; an accessor-bearing document; a successful field-type candidate;
an absent pointer; and a tagged representation field with no native destination.
The packet also records copy isolation and preservation of unknown content.

The predecessor considers the unresolved native type and unsafe numeric host
interpretation valid but incomplete, with `AVRO_VALIDATOR_LIMIT` and
`AVRO_NUMERIC` warnings. Invalid UMF document structure yields validation
errors. Unknown Avro metadata remains warning-only; the proposed edit preserves
it and the unrelated UMF extension. An unknown tagged representation field
blocks a proposed edit with `AVRO_REPRESENTATION`, since that content cannot be
recovered into native Avro JSON. Inspection reports accessor input as a `NON_JSON`
validation error without invoking its getter; proposal admission throws
`UmfError(NON_JSON, ...)` before editing.

The capture was made with Bun 1.4.3 and avsc 5.7.9 from repository HEAD
`744f61566867ad29b3d349df42b16ff9ce6a9f63`. `predecessor.json` embeds SHA-256
hashes of the TypeScript operation and its admission/validation dependencies.
Reproduce it without rewriting the frozen packet:

```sh
bun run scripts/rust-migration/r8/capture-avro-inspect-edit-predecessor.ts /private/tmp/avro-inspect-edit-predecessor.json
```

The captured and reproduced packet hashes are both
`06961649e4873ee01fb14b19d7004e8f34c50592c8582a0cd88aef8dd7417303`.
Focused assertions run with:

```sh
bun test tests/rust-migration/r8-avro-inspect-edit-predecessor.test.mjs
```

That run passed four tests and 22 assertions on Bun 1.4.3. Reproduction to
`/private/tmp` also produced byte-identical JSON. These checks establish packet
reproducibility and TypeScript predecessor observations only.

The inspected Rust candidate has material comparison points. Its
`avro_semantics::inspect_schema` is a native-tree profile, not the TypeScript
UMF-document operation: it classifies unresolved names as `AVRO_UNRESOLVED_NAME`
errors, checks bounded structural rules, and always emits `AVRO_PROFILE_LIMIT`.
The TypeScript implementation delegates native interpretation to avsc and
records interpreter failures as warning diagnostics. The Rust edit report also
has a different shape: it separates UMF admission from `nativeInspection` and
returns a named R5 candidate profile, while the TypeScript proposal returns one
`validation` report. The frozen packet now makes these distinctions available
for a later differential comparison; no Rust-candidate replay or parity claim
is included here.

Frozen artifact SHA-256 values:

| Artifact | SHA-256 |
|---|---|
| `predecessor.json` | `06961649e4873ee01fb14b19d7004e8f34c50592c8582a0cd88aef8dd7417303` |
| `scripts/rust-migration/r8/capture-avro-inspect-edit-predecessor.ts` | `0081f550193e1f17897fcc52b4b53d86d7865c64d7558f352a761ffd3f38a88e` |
| `tests/rust-migration/r8-avro-inspect-edit-predecessor.test.mjs` | `babc69724577d6dd5871a94284a0eae96e865d23b87b4ca4d3b61e68fd522f38` |
