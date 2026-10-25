---
ddx:
  id: umf.evidence.rust-migration.r5-core-keys
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

# R5 core Key and Record membership operations

This opt-in Rust module ports `inspectCoreKeys`, `lookupCoreKey`,
`declareCoreRecordMembers`, `declareCoreKey`, and
`verifyCoreKeyOperation` for the current core 0.10.0 profile. It retains source
and unknown qualifiers, requires stable identities, preserves ordered
components, checks authoring conflicts, validates receipts before recomputing
them, and charges operation work through `Context`. TypeScript remains the
default route; the operations are available only through the opt-in core-model
API. No default cutover is claimed.

[`frozen-typescript.json`](frozen-typescript.json) records 16 predecessor
operation cases and 19 outcomes over a 25-file TypeScript/resource closure.
The Rust parity test compares complete operation envelopes and refusal
code/message/path triples for each case. It also checks stale receipt
verification, JSON and YAML receipt round trips, unknown qualifier retention,
ordered tuple conflicts, cooperative work metering, and cancellation.

The focused checks passed on the recorded source state:

- `cargo test -p umf-core --test r5_core_keys --locked --offline`: 6 tests
  passed; Sol independently replayed 6/6.
- `bun test tests/core/key-operations.test.ts`: 8 tests and 99 assertions passed.
- `bun scripts/rust-migration/r5/freeze-core-keys.ts`: packet regenerated from
  Bun 1.4.3 predecessor behavior.

The original core-only packet covers operation behavior and ordering; its
focused checks do not establish host or binding parity. Broader Rust crate
qualification and default route changes remain separate R5–R8 gates.

Independent Sol review found three validation-order defects in the first
candidate: duplicate declarations passed request admission, malformed lookup
keys could lose precedence to source errors, and malformed receipts could be
recomputed before schema validation. The revised module fixes all three. Sol
replayed all six focused Rust tests, verified the 25-file predecessor closure
and the final source/packet pins, and found no remaining P1/P2 in this bounded
core slice. The final lookup vector combines a numeric key with an invalid
source so moving key validation after source lookup would fail the packet.
At the core operation layer, immediate cancellation and cooperative metering
are evidenced. Wire resource-limit/cancellation controls and installed Node
replay are separately evidenced below; interruption remains open.

The binding follow-on now dispatches the same five operations through the
opt-in Node/Rust wire route and exposes them in matching Node/Bun and WASM
facades. The wrappers preserve tagged operation arguments without reshaping
payloads. The focused wire suite passes 2/2 tests, including all 16 frozen
cases and resource-limit/cancellation controls. The wrapper suite passes 2/2
tests for both facades. A cleanly packed and installed Node package replay
passes 17 cases (16 frozen cases plus stale-receipt verification); Ajv 8 Draft
2020-12 accepts all seven actual successful Rust receipts and rejects a
forged-version mutation. The replay normalizes host-decoded null-prototype
objects to JSON data before comparing frozen envelopes, so it proves JSON-data
parity, not JavaScript object-prototype parity. WASM wrappers are packaged and
source-pinned, but a real browser/WASM runtime replay remains open because
`wasm-bindgen` and `wasm-pack` were unavailable. Python bindings and default
cutover remain open. The revised core module also carries
diagnostic `Utf16` path/message values directly and meters copies of existing
Key subtrees before materializing updated receipts. A Rust regression verifies
that an existing lone-surrogate qualifier on a Key field reference survives an
update. The request-field raw-key setter is defensive: the current request
validator only admits the exact `module` and `element` keys, so arbitrary request
qualifier keys are not currently reachable.

SHA-256 pins:

- Rust core module: `4d5d11864c90c9a599b7fb8bab25fbe9ec074ae66cac26b9dfea2c0dff33320d`
- focused Rust test: `56f22ca1fd6c7e33be38857cfd4a7f8b1f6473936a1cc2e94fdc771b8507034f`
- core wire dispatch: `bd558315f5df24e0f88979ab4e8962a48bbf232dc96f6091739731a1d22ed148`
- focused wire test: `0027e78f4aad4efb8f337056a94ce96af8d5205ee3d137708f92120e7d5660b5`
- focused Node binding test: `725cee67c8efe07c6bb5569e7366e1e8a97bddc34956cc386f10c9188fe3f653`
- Node and WASM operation wrappers: `1b3c49b45d27424abc87c1df06506f910d95a093deaafb6b40b383facbe60fd8`
- Node wrapper test: `81a35802812fa0118df9d1c63a07888b7eef3482321bef3d6bc1dad0e4651615`
- installed Node replay: `55713b6102c3622756ce50f695564264d0dd4dbe53dd788fb558b545f2bd9669`
- actual-output Ajv replay: `16a5f2845c0b5209adaeffa29401c0c3a48899eba861733974e58e4147917c0c`
- Node/Rust capture: `fa1cefd6f60e2ced24caa72f9e20f7c072db6b97b435f016bcac8ae010e9aa95`
- Node/WASM indexes: `4a5fc9f88b7e3098ae62e775976e3f28995ce450b48bdb197f56bc8265dda3fa` / `2c69129772c648c0998b154fb7bff03a1ae35a27790fe449223889d47bd33096`
- Node/WASM declarations: `e071f10d1c0279dc2b362c2ea89ba652250a6741b3a9cedbed8388beea2cbe65` / `a5bd2bca3126b4160e02b9dc98f2c29caa42db0ba6252135e9662e1d2db95b85`
- Node package manifest: `b194014ddddb3ce4896f726779ccf39875a7639a1f04f8a739d3580644032947`
- WASM source inventory: `0573b7957a598b6d522efc3001e9cb60e060811f394ce7665820e9fb9a78095d`
- WASM source checker: `4c4164b5c7ccd184ab125540b15db668c176925e7ca9e45efe057bba69ba6020`
- TypeScript freeze runner: `cd38bc2917a1f2a030264e42ee4135e25850fedddbf76d52b5ab3f054d42653a`
- frozen predecessor packet: `b6e976136750ed0112e9830d24b6e7e41d41485ed172f8a059954a12c413dd8f`
