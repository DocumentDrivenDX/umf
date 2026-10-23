---
ddx:
  id: umf.evidence.rust-migration.r5-selection
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# R5 core element selection

This bounded Rust core slice implements `selectCoreElements` for the current
core `0.10.0` profile. It returns a copied source envelope, copied query,
complete source validation, stable-order selected snapshots and four boundary
arrays. Filter categories combine with AND, values within a category combine
with OR, and empty arrays match nothing. Exact raw UTF-16 units identify modules
and elements. Transitive traversal follows explicit `references`, `itemType`,
`members` and key fields only; it terminates on repeated edges and cycles.
Unknown reference annotations and extension payloads are retained in copied
data, while references inside extensions are not traversed.

The operation copies the full source and query, validates the entire source
with the caller's `Engine`, `Registry` and capabilities before selecting, and
meters source scanning, filter comparisons, graph work and result copies through
the invocation `Context`. Invalid core documents and registry semantic errors
refuse even when a filter is empty. It does not expose a binding operation or
change the default TypeScript API.

## Frozen predecessor and controls

The successful predecessor envelopes are the complete `result` and `closure`
values in
[`fixtures/validation/core-selection.json`](../../../../../../fixtures/validation/core-selection.json).
They preserve repeated annotated edges, unknown scalar and extension meanings,
cyclic references, distinct module contexts, copied source/query data and the
four boundary arrays. The fixture's SHA-256 at capture is
`f75ba587ed078e6f042b3ad584c4ad14b876f76c10e4df591b13b4fe746c10f3`.
Adapter recovery envelopes remain separately frozen in
[`core-selection-adapters.json`](../../../../../../fixtures/validation/core-selection-adapters.json)
with SHA-256
`39d68ced2847100f88ecb9ff9477ccbb94e1ebce3e871ae191adf8c42bde5cef`.
The TypeScript predecessor implementation and production result schema at
capture had SHA-256 `db9ff795c112df42e5db2cd1194659bb09e19422ebbd0b7997671e4faf9ae195`
and `642e3d3f152b4e8853730eef496415eb88000212936fc9d4a39d2cc4a456bc69`;
these are historical input hashes. The corrected current schema SHA-256 is
`74b35be467972d71c4a3b80d056c2c691ca7cdc59fe90cb62e4f85bf2812a555`.
It adds the accepted nonempty `cardinalities` query array and now includes the
complete current core definitions. `scripts/core-selection-schema.ts` rebuilds
the current schema, and a fixed-point test compares the complete result.

The refusal fixture
[`frozen-refusals.json`](../../../../../../scripts/rust-migration/r5/selection/frozen-refusals.json)
stores complete TypeScript envelopes for invalid source references, malformed
source shape, caller-registry semantic rejection with an empty selection,
malformed queries and over-limit copying. Run
[`freeze-refusals.ts`](../../../../../../scripts/rust-migration/r5/selection/freeze-refusals.ts)
to recompute those outcomes and assert that the frozen envelopes have not
changed. The original complete successful envelopes remain in the existing
fixture above.

`crates/umf-core/tests/r5_selection.rs` compares both frozen success envelopes
as complete Rust `Value`s and all frozen invalid-source, invalid-query,
registry-semantic and over-limit refusal envelopes. The malformed-query matrix
checks each invalid filter, identity and reference-policy branch against the
same TypeScript generic refusal. A metered descendant walk preserves the exact
first failing descendant path and predecessor message for copy-limit refusals
while the shared copier keeps its early allocation checks. Other focused cases
check empty-filter source validation, raw lone-surrogate identity, stable
result order, work-meter refusal, all four nonempty boundary arrays, their
transitive closure, cycle termination and extension-reference exclusion.
[`verify-ajv.ts`](../../../../../../scripts/rust-migration/r5/selection/verify-ajv.ts)
validates five actual Rust output envelopes with the production Draft 2020-12
result schema, including a Rust cardinality-filter result, and compares the two
frozen predecessor envelopes exactly.
[`graph_oracle.py`](../../../../../../scripts/rust-migration/r5/selection/graph_oracle.py)
independently reconstructs initial matches, graph closure, provenance, order,
and all four boundary arrays from source and query data; it checks five Rust
outputs including cardinality filtering. The graph case includes repeated
references, an explicit cycle, annotations, and core references excluded from
extension payloads.

The current schema fixed-point and cardinality behavior also pass their focused
Bun tests, and TypeScript typechecking passes. The metamodel check was attempted
but could not create the repository-local `target/metamodel-compiler/build.lock`
under this worktree's filesystem permissions; it did not reach compilation.

The reopened Sol review identified that the bounded copy-limit walk needed to
meter prospective UTF-16 key and descendant-path construction before allocating
either. The walk now charges a conservative key/path upper bound before escaping
or copying key data. A long-key, low-work-meter regression confirms the host
refusal occurs on that charge before descent; the focused Rust suite now has ten
passing tests. Independent Sol rereview found no P1/P2 in this bounded core
slice at `selection.rs` SHA-256
`ac64ce4cf45b893d3a0152796c7120dba8097247155ad29ff939d39a7c7a09f5`.
The reviewer reproduced all ten focused Rust tests, five actual-output Ajv
checks, five independent graph-oracle outputs, frozen refusals and artifact
hashes. The review does not cover host bindings or default cutover.

## Reproduction and limits

On Darwin arm64 with Rust 1.90.0, Bun 1.4.3 and the repository's locked Ajv:

```sh
PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-r5-selection-target \
  cargo test -p umf-core --test r5_selection

PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-r5-selection-target \
  cargo test -p umf-core

PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-r5-selection-target \
  bun scripts/rust-migration/r5/selection/verify-ajv.ts

PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-r5-selection-target \
  python3 scripts/rust-migration/r5/selection/graph_oracle.py

bun scripts/rust-migration/r5/selection/freeze-refusals.ts
```

The ten focused Rust tests pass. Ajv accepts all five actual Rust result
envelopes, the two predecessor success envelopes match exactly, the independent
graph oracle matches all five outputs, all frozen refusal snapshots remain
unchanged, and Rust formatting checks pass for the core module, tests and
fixture emitter. The full `cargo test -p umf-core` suite also passes, including
109 library unit tests and the integration tests.

This evidence and independent review cover the bounded Rust core function and
its fixture oracles. The separately scoped
[R5 selection binding evidence](../r5-selection-binding/README.md) now records
the Node/Bun and real-browser WASM adapter parity for this operation. No
adapter-native equivalence, default API cutover, or TypeScript retirement is
established.
