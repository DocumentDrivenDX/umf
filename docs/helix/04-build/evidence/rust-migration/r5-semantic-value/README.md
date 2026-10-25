---
ddx:
  id: umf.evidence.rust-migration.r5-semantic-value
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

# R5 semantic value checks

This opt-in core slice implements exact-reference `check` and
`validate_semantic_type_value`, plus `validate_core_semantic_type_value`, under
CONTRACT-078. The current synchronous TypeScript predecessor was frozen before
the Rust changes in `frozen-typescript.json`; its packet pins the current model,
registry, validator, schema, and generated-resource source closure.

The Rust `SemanticTypeValidator` is a distinct synchronous trusted capability.
Its token is attached only by the caller-owned registry; definitions and
references from a document never install executable code. The same mutable
`Context` used by the core operation is passed to the validator. Callback
ordinary host failures become `unknown`/incomplete with the predecessor's issue
text; malformed return shapes become `Malformed validator result`. Meter,
cancellation, deadline, and resource-limit failures remain operation errors.
Inputs are copied before every callback and callback results are copied before
shape validation. `null` is passed unchanged, declaration order is retained,
issues flatten in that order, and aggregate status is invalid > unknown > valid.

The capability is cooperative and synchronous. A validator can report work by
charging the shared `Context`, and that charge polls the caller's meter,
cancellation, and deadline hooks. A callback that does not cooperate cannot be
preempted; the implementation makes no hard CPU/fuel guarantee. Host bindings
are not part of this slice. Any later binding that exposes a callback-reported
work function must route it into this same Rust `Context` counter before making
a cumulative-budget claim. No wire route or default route changed.

Focused validation passed with the repository-pinned Rust 1.90.0 toolchain:

- `cargo test -p umf-core --test r5_core_semantic_types --offline --locked`: 10 passed.
- `bun run typecheck` passed with Bun 1.4.3.
- `rustfmt --check` and scoped `git diff --check` passed.
- The frozen predecessor was produced with `bun scripts/rust-migration/r5/freeze-semantic-value.ts` using Bun 1.4.3.

SHA-256 pins:

- Rust semantic-types module: `b07b5ea1519276756a1509b12e053fb62f141abffcbb420eb14c3f836c7e66e2`
- focused Rust tests: `31dd8e1e138a7a6ff21eb47f3fe1608a2d40594c4996ee871f1b2bd5e5082fbb`
- TypeScript freezer: `a56e182d121900cbe5ec29941bb31d9629152a2c40484139a607144d4931db38`
- frozen predecessor packet: `bee5042ab3ad625327183cdaf81c3bad9846f37f2a57f1d6fd13282e65deb297`

Independent Sol review reproduced the 21-source freeze closure and focused
10/10 Rust replay from these pins. It found that large callback failure and
successful issue strings could be copied before their work was charged. Both
paths now charge UTF-16 units before constructing the result, with meter
regressions for each. The reviewed opt-in core slice has no remaining P1/P2 in
its stated synchronous, cooperative scope.

The slice does not add Node, Bun, browser/WASM, or Python callback bindings;
`validateCoreSemanticTypeValue` host exposure and cumulative callback-work
transport remain open. The old-core `inspect` contract/source discrepancy,
transition APIs, extension prototype accessors, and default-route/cutover review
also remain open.
