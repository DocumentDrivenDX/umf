---
ddx:
  id: umf.evidence.rust-migration.r5-core-relationships
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R5 core relationship operations checkpoint

This opt-in Rust core slice ports the live TypeScript family in
`src/model/relationships.ts` for core 0.10.0: `inspectCoreRelationships`,
`lookupCoreRelationship`, `declareCoreRelationship`, and
`verifyCoreRelationshipOperation`. Inspection and lookup use operation version
3.0.0; authoring uses 1.0.0. The Rust module retains the complete source and
unknown qualifiers. It does not establish author authentication, native
relationship enforcement, or native-equivalence graduation.

The predecessor packet freezes 17 operation inputs and outcomes, including
known/missing meaning, stable-ID lookup, authoring, future lifecycle and
qualifier preservation, identity/endpoint conflicts, unsupported-version and
crossed refusal order, and UTF-16 JSON Pointer escaping. Separate outcomes pin
JSON/YAML receipt verification, forged-receipt refusal, source copy isolation,
and the first offending paths at the ordinary 100,000-value and depth-128
structural limits. An aggregate-output control also pins the first offending
path when authoring adds generated receipt fields to a valid source containing
60,000 retained unknown values; refusal must leave the caller's source
unchanged. The TypeScript source/resource SHA-256 closure is embedded in
`frozen-typescript.json`.

Authoring preserves relationship and endpoint qualifiers by stable endpoint
identity. Existing IDs cannot change endpoint sets, target keys, direction, or
association Record. Unknown qualifiers allow presentation edits while blocking
participation/lifecycle changes; an unrecognized lifecycle remains inspectable
and blocks edits. Explicit null `inverse` removes that presentation. Receipt
verification recomputes the operation and compares the retained source or
target snapshot. Object comparison is order-insensitive and charges key and
node work to the caller's `Context`, so host meter, cancellation, and deadline
controls remain active during verification. Structural copies stop at the
predecessor's first over-limit value/path and grow incrementally after admission.

The focused Rust target is
`cargo test --offline --locked -p umf-core --test r5_core_relationships`;
the four Rust tests compare frozen results and refusals, replay JSON/YAML
receipts, check copy isolation and resource boundaries, and confirm late host
meter refusal propagates. The live Bun baseline is
`bun test tests/core/relationship-operations.test.ts` (6 tests, 177 assertions).
The default TypeScript route, shared core-wire, host bindings, browser package,
and native relationship adapters are unchanged by this checkpoint. Binding
parity, browser execution, default routing, and all native target gates remain
open.

Artifact SHA-256:

| Artifact | SHA-256 |
| --- | --- |
| Live predecessor `src/model/relationships.ts` | `66b15764cb80059de8e98adb9741b9314a1966674f22ef4f114306e679d5e547` |
| Frozen TypeScript packet | `b7e2d26ad9333141f0db2f78c559ad4ed55e8f6f6359464ceedad570db1f75cc` |
| Rust core module | `b68b93fbefeda05debbd130f9801b49e0952634b40fbe1bed967f65664349b35` |
| Focused Rust differential test | `53779f133e834af883094a5b2f64bc7c9b59b98fe93c23a257276aebab6fecb1` |
| TypeScript freeze script | `7d511b07509f1f6123b2e9bb84a3fa0ee14788b97daeb39ec81a4cedcd49f4d8` |

These hashes bind this source checkpoint only. The packet's embedded closure
hashes bind the current schema, validators, generated model, and fixture
helpers. They do not bind a Node/WASM artifact or installed consumer cohort.

## Successor checkpoint: opt-in tagged-wire and installed Node/Bun

The following successor adds the four opt-in operations to `umf-core-wire`
and the Node/WASM core-model facades: `inspectCoreRelationships`,
`lookupCoreRelationship`, `declareCoreRelationship`, and
`verifyCoreRelationshipOperation`. These four relationship exports still
inherit TypeScript at the package root; this opt-in binding does not change
their default routing. This evidence does not claim native database
relationship enforcement, default-route graduation, or a published SDK
release.

The tagged-wire test replays all 17 frozen operation cases and separately
checks JSON/YAML receipt round trips, forged receipts, copy isolation,
aggregate-output source immutability, the ordinary value/depth limits, and a
host cancellation during retained-operation verification. It compares
decoded objects without depending on member order, while retaining exact
UTF-16 strings, duplicate-member multiplicity, and array order. The focused
result is 2/2 tests passing (`cargo test --locked --offline -p
umf-core-wire --test r5_core_relationships_wire`; isolated target:
`/private/tmp/umf-r5-core-rel-wire-target`). The Node/Bun/WASM helper unit file
is 4/4 under Bun 1.4.3. `bun run typecheck`, Rust formatting, and
`wasm-package-sources.ts --check` pass.

A clean, temporary Node package archive was built from the exact Node package
file allowlist and the isolated release addon, then installed offline under
`/private/tmp/umf-r5-core-rel-installed/app`. The copied replay harness uses a
bare `@umf/core-rust-native` import from that install root. Node 26.12.1 and
Bun 1.4.3 each pass all 17 frozen operations, two retained receipt
round-trips, and seven additional copy/limit/control assertions. Both receipts
pin the packet, source closure, Node/WASM entrypoints, facade pair, Rust wire
source and test, generated metamodel/resource inputs, and native artifact.
These refreshed receipts use the fixed-point source cohort at
`/private/tmp/umf-r5-core-rel-final`; the candidate archive is
`umf-core-rust-native-0.1.0.tgz` (SHA-256
`83d21d3d9bb0220d2992fbe4e4927d4d38f52c2c5960edaf1a8dae83212a40a5`), and
the fresh native addon is SHA-256
`0f480f640860c416e6f3728ef1bbf9caa36e2fe08d97416e15a4b613fc776afe`.
Archive contents are the 15 allowlisted package files plus
`umf_core_node.node` (16 total). The package manifest remains `private: true`.

The WASM crate was freshly built in release mode for `wasm32-unknown-unknown`
with locked offline dependencies and pinned wasm-bindgen 0.2.100. The clean
extracted package passed in Chromium 153: all 17 frozen operations, both
receipt round trips, forged-receipt refusal, copy isolation, and zero-work,
cancellation, and deadline controls. The refreshed archive contains 16
package members and has SHA-256
`66ed1b6a3cc6806a176fd8f07fe976d726ca4a317fb017a7f1ccb2ba140fa2af`.
The source-bound receipt is `chromium-binding-replay.json`; it records hashes
for the generated glue/WASM, predecessor, Rust wire/test, harness, and all
five resource inputs passed to the browser harness. This qualifies the opt-in browser binding only; it does not
claim native database relationship enforcement, default-route graduation, or
a published SDK release. The opt-in binding remains a candidate pending
broader host/resource review, independent Sol review, and any later
default-routing decision.

Successor evidence:

| Artifact | SHA-256 |
| --- | --- |
| Frozen predecessor packet | `b7e2d26ad9333141f0db2f78c559ad4ed55e8f6f6359464ceedad570db1f75cc` |
| Wire dispatcher | `31cf3843617016d37db8d9442714b058b9fadce0ccfd57ff616c5806fa704933` |
| Focused wire test | `646730597e36cf9084301c7ffcba56d2bc17466c309d90719633b2c4a1877b6c` |
| Node index | `fb78fbf65ce118a90fcc49922860eec8febb007572259baa4d82c787ed616474` |
| WASM index | `e163b0df3949c7b4ec97ff2583192b1689793371fa0bde0301b41fadf875fccd` |
| Node/WASM relationship helper pair | `3b73434ef7c0115cf2816333738c6fe0ff9763aff9d426ff82917c06cf6f9e3c` |
| Node installed replay receipt (fixed-point source cohort) | `f170c25468c1c7d9958cfd7f2301062459433e7db853b1a8d4ce9edbdcf41dc4` |
| Bun installed replay receipt (fixed-point source cohort) | `4ec6a38ba7c3533a9cb8bdde33377aa9778b6849db34789e187ed5cbf55eea51` |
| Replay harness | `72b2e4cb99514ee9f81075057917e261c8505ec93e81cb90654f0c77f1651888` |
| Chromium replay receipt | `863e3542d192e2dd046f97a026edccd7144692b3c81f32e3bc78eee0e511ca4e` |
| Chromium replay harness | `b512ba32bc27858bfa286c2d9960d232b3d68905b430dc8b26f5fa75b5c25058` |
