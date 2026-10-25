---
ddx:
  id: umf.evidence.rust-migration.r5-record-members-inspection
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R5 record-member inspection checkpoint

This is a bounded Rust implementation of `inspectCoreRecordMembers` for the
current 0.10.0 core document and operation profile 0.3.0. The TypeScript route
is retained under `./reference`; the current V4 Node and browser roots
source-select the Rust inspector binder. A retained Rust runtime now owns the
exact five Engine resources, an empty Registry, and a compiled 0.3.0 result
schema for repeated inspection calls. This checkpoint does not claim an
installed default package or closure of the full model family.

`frozen-typescript.json` pins 11 current predecessor outcomes and the source
closure: known members, explicit empty, absent, inapplicable field, unknown
member qualifier (including an isolated UTF-16 surrogate in a qualifier path),
reversed identity property order, missing element, extra identity member,
source diagnostics, and retired version. The focused Rust wire test compares
all 11 outcomes, including refusal code/message/path triples, and checks JSON
and YAML source round trips. It retains caller identity member order and full
source; explicit empty membership remains distinct from an absent declaration.

The tagged test adapter accepts only `op`, `resources`, empty `registry`,
`source`, and `identity`; `resources` contains exactly the five core schema,
reference schema, package schema, generated constraint, and domain policy
members. Missing or extra request/resource fields and a nonempty registry
refuse. Its capability test adapter rejects any requested extension callback.
This request shape is only for tagged differential testing: it transports
resources per call. The retained runtime constructor accepts exactly the five
resources and compiles the pinned result schema once; each `inspect` call takes
a caller-owned fresh Context and installs no extension callback. If semantic
validation reaches a callback, the fixed capability implementation refuses it.
The retained runtime API is in
`crates/umf-core-wire/src/record_members_inspection_binding.rs`; later opt-in
Node and WASM binding qualifications are recorded separately in
[`node-retained.md`](node-retained.md) and
[`wasm-retained.md`](wasm-retained.md).

`node-current.json`, `bun-current.json`, and `chromium-current.json` record fresh
opt-in source-cohort replays of all 11 cases. Node 26.12.1 and Bun 1.4.3 each
match all frozen outcomes; Chromium 153.0.8010.12 matches all cases with Node
globals absent. The older `chromium.json` remains as the historical nine-case
receipt. The fresh Chromium runner copies the current WASM JavaScript wrappers
to a scratch host and pins their copied bytes, the generated wasm-bindgen glue,
and WASM binary. Node receipts hash the staged package JavaScript and assert it
matches repository source before running.

These are scoped source-slice receipts, not full transitive-build attestations:
they pin the operation Rust module, wire dispatcher, binding Rust source,
focused packet test, exercised JavaScript wrappers, binary, and packet, but do
not pin every Cargo dependency/build input or every package source file. They
qualify only the tagged, empty-registry, exact-five-resource request subset in
the frozen packet. They do not qualify raw-host accessors/proxies, extension
callbacks, general resource admission/control parity, retained
Engine/Registry resources, performance, or a default package route. Later
retained receipts qualify the bounded lifetime and host subsets separately.
The current package roots remain unchanged.

Validation recorded for this checkpoint:

- `cargo check -p umf-core`
- `cargo test -p umf-core-wire --test r5_record_members_inspection`
- `cargo build -p umf-core-wasm --target wasm32-unknown-unknown --release`
- pinned `wasm-bindgen` 0.2.100 generation and Chromium browser replay
- isolated Node-API release build, then Node 26.12.1 and Bun 1.4.3 packet replay
- isolated WASM release build, pinned wasm-bindgen generation, and Chromium
  153.0.8010.12 replay

The frozen packet pins its current predecessor source/resource closure. The
focused Rust wire test passes all 11 current cases, and the retained runtime
unit test independently compares all 11 outcomes, including exact refusal
code/message/path values. Constructor tests cover missing and extra resources;
a capability test verifies the no-callback refusal. Fresh Node,
Bun, and Chromium receipts each match the updated packet.

The Node-API frozen differential harness is
`scripts/rust-migration/r5/record-members-inspection-parity.mjs` and completed
for the fresh private Node/Bun packages above. Rust result-schema failure diagnostics
also
retain a known boundary: the core reports its schema validator's first failure
instead of serializing Ajv's complete error array. The frozen normal/refusal
cases do not exercise that unreachable internal result-construction failure.
Independent review classified it as a P2 outside the packet claim. Shared host
admission, transport, resource-boundary and metering parity also remain open.

Key hashes:

- frozen predecessor packet: `d7b8a9438a4a3f58b88255d8ae5b8acbb972dec02a2293d72499faadd6c8980e`
- Rust core module: `b31ef1d33924e30aa62eeac245aa5713ec9411b5a4cad244e74ac8d329e7a524`
- Rust wire dispatcher: `3446a8451afe060c4256aa0e80fef2133ff64625f8d6dfe71151d92fa7791c38`
- Node binding Rust source: `c89811bc626633b77257752f6fc4d19fab433a49986aefd27ba5e07b3353aea1`
- WASM binding Rust source: `1da834ec637a47dd52eeeff8f9d33fcb08a526f482736d3b3e58c4e033a60bf9`
- focused wire test: `12d3a588913bc1d7faa4d6e4b7eb7d630828ae87d068c59523d0cc927dd6e152`
- retained runtime API and focused tests are covered by the current Rust source hashes below.
- Node receipt: `dc68c83debdb886b2226003e87c3420a29b20dba67b8bb1ec98df68de81d8565`
- Bun receipt: `eeb167431ada757a2e878a77ea4e84d6775a3edf04e7355aa56b3a30c198629f`
- current Chromium receipt: `ac4cc5a9e28ffe3cfab00280a2ab102d339c514d468cf2bb0cd3967d1c6c57e0`
- Node addon: `971ad186f3a627348f82fbb46ae9c05716524ebc85d029facccdb1057714be09`
- WASM binary: `80a85e3b20860c6d54dbc60d0b61e2a9f837f197d11158b33ed764f50a35a2e7`
- wasm-bindgen JavaScript: `e70109ed5dd5c9cc37a9d7f5adf7a1f073de3edc4b9a1bacd1662928026494e5`
- record-members Node replay runner: `0aaa842db2ce28c30e68faf8e61be23a80539dd73d36032f0dde911182edb8a9`
- record-members Chromium replay runner: `8ab143ce21b44859dd41ec4113a818d9b1943b117b1ca4e9c4a85a72c0680804`

Retained runtime source hashes at this checkpoint:

- Rust core inspection module: `9fb2c030e50f7557c7b5d7427615d09f8dda438467efee5c89f185b5d8410a9e`
- Rust retained wire runtime: `d21ea16006c7065e07dcaa3647437614a680c53321d8135083fa6d43345a6184`
- Rust core-wire module index: `56991e5a080e2de46cda6f3c63ebb44d55c4178023cc9583d86dec4f238d24e0`

The [retained Node checkpoint](node-retained.md) adds a separate opt-in
`createCoreRecordMembersEngine` that retains these resources and the compiled
result schema across calls. Fresh Node and Bun packages match all 11 frozen
cases. This does not select the operation on the default root or broaden the
callback, raw-host, or installed-SDK claims above.
