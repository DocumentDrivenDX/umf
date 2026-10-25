---
ddx:
  id: umf.evidence.rust-migration.r5-semantic-type-accessors
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
---

# R5 retained semantic-type extension accessors

This opt-in Rust slice implements copied `getSemanticTypes` and copy-on-write
`setSemanticTypes` behavior for the retained `umf.semantic-types` 0.1.0 element
extension. `validate_semantic_types_document` provides the corresponding
extension-specific document diagnostics for callers that need the prototype's
warning behavior. It does not install any default route or wire/binding entry.

The frozen Bun 1.4.3 packet captures the current TypeScript accessor outcomes for
profile refusal, missing annotations and elements, malformed payloads, invalid
annotations, error precedence, input/result copy isolation, profile creation,
unknown wrapper/reference content, warning ordering and preservation of native
and unrelated extension content. Its `sourceClosureSha256` pins the live
implementation and the recursively imported validation, registry, generated
model/validator, metamodel policy, low-level literal, UUID/bit128, schema and
package resources (25 pinned inputs total).

Rust registers the retained extension package against the caller's `Engine`
resources for each invocation, validates through the shared engine and
`Context`, and runs the fixed semantic warning callback locally. Unknown
extension annotations remain retained and warned; external term meanings remain
unresolved. Meter, cancellation and deadline errors propagate. Registry setup,
document copying, identity scans, warning generation and error serialization are
charged to the same invocation context.

Focused validation passed with pinned Rust 1.90.0 and Bun 1.4.3:

- `cargo test -p umf-core --test r5_semantic_type_accessors --offline`: 4 passed.
- `bun run typecheck` passed.
- `rustfmt --check` and scoped `git diff --check` passed.
- `bun scripts/rust-migration/r5/freeze-semantic-accessors.ts` produced the packet.

SHA-256 pins:

- Rust accessor module: `0f58c3f4eafc084a44404013942fc9cef6a53ff23771f5c1f47c200e4494cf50`
- focused Rust tests: `d234f802f64de6fad4469e1885dc1e1bee1abc49c719f8ca8e47695692e32e35`
- Rust module export declaration: `a41200c7ad4d64c6c152e84760d5e1803e62f4cf5e821312669c1186c23b62dd`
- TypeScript freezer: `e746607526336cfe3806ee980ffe60aa85241cb35fae94e20de1c28fbbb6ef6a`
- frozen TypeScript packet: `7fef2748fdd3749602e16d5eb9fcb8ded33b796e6b8d72b991f2558e5d86ddc9`

This does not port the general-purpose extension registry API or expose the
TypeScript `semanticTypesRegistry()` object shape. Host bindings and default
routes remain unchanged. The core 0.10 semantic-reference APIs and value checks
remain in their separate opt-in module. CONTRACT-078 upgrade/rollback transition
APIs remain absent from current TypeScript source and schemas; their retired
implementation survives only in history and is not used as a live differential
oracle. The old-core `inspect` discrepancy and broader family review remain
open.

Independent Sol review verified every one of the 25 frozen source hashes,
checked the normalized local-import graph for missing transitive inputs (none),
and reran the focused Rust suite (4/4) against the pinned module and test
sources above. The first freezer omitted nine imported inputs; those were added
and the packet regenerated before acceptance. Sol added a direct replay of the
frozen malformed-get case that had been captured but not asserted, then reran
the focused suite (4/4). No P1/P2 remains in this bounded opt-in accessor scope.
