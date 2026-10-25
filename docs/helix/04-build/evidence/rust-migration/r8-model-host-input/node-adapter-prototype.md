---
ddx:
  id: umf.evidence.rust-migration.r8-host-json-node-adapter
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# R8 Node host-input adapter prototype

This opt-in prototype adds `createCoreSchemaPropertiesHostInputEngine` to the
Node package. Its `declareCoreSchemaProperties` method uses the private
`umf.host-json/1` dispatcher and Rust's staged declaration entrypoint. The
existing `createCoreModelEngine` route is unchanged. Rust copies and admits the
patch before reflecting on source, then copies source before identity, with one
ordinary operation `Context`. A host-control callback option is explicitly
refused by this method until the bridge supports those controls.

The JS adapter interns object handles by identity and keeps descriptor
snapshots and immutable UTF-16 string tokens in invocation-local maps. It
captures the reflection, Map, string and JSON intrinsics when its module loads.
Descriptor snapshots are materialized before Rust requests individual
descriptors; descriptor values are classified lazily. String reads return no
more than 8,192 UTF-16 units, and the Rust adapter bounds the tagged response
frame before decoding. All invocation maps are cleared in `finally`. A thrown
Proxy trap value is latched without inspecting it and rethrown by identity
after the Rust call returns. Replies are decoded against the originating event;
boolean classification is kept distinct from boolean reflection replies.
Chunk token, offset, maximum size, and exact expected unit count are validated
before Rust allocates its accumulated unit vector. The N-API UTF-8 byte length
is queried before conversion allocates the response buffer. The JS dispatcher
uses captured `Array`, `TypeError`, and DataView methods for reply framing.

Validation used a fresh debug addon built from the current checkout in an
isolated target directory. The addon was copied to
`/private/tmp/umf-hostjson-node-test/bindings/core/node/umf_core_node.node`;
the shared ignored addon was not replaced. The 20-case harness passed on Node
26.12.1 and Bun 1.4.3. It checks the frozen declaration, source-before-identity
refusal, patch refusal before any source reflection, raw thrown-object
identity, patch-before-source Proxy ordering, a 20,000-unit root string, five
primitive patch roots, eight nested scalar values, and a hostile
`%TypedArray%.prototype.length` mutation that must not corrupt copied numeric
output. Bun compares scalar
cases directly with the TypeScript predecessor; Node compares against frozen
expected result triples because Node cannot resolve the predecessor's
extensionless TypeScript imports. The fixture resources and frozen TypeScript
result come from the R5 schema-properties packet.

```sh
UMF_HOST_JSON_BINDING=/private/tmp/umf-hostjson-node-test/bindings/core/node/index.js \
  node scripts/rust-migration/r8/schema-properties-host-input-node.mjs

UMF_HOST_JSON_BINDING=/private/tmp/umf-hostjson-node-test/bindings/core/node/index.js \
  bun scripts/rust-migration/r8/schema-properties-host-input-node.mjs
```

Both runs reported `{"cases":20,"status":"pass",...}`. The fresh debug addon
was built offline with Rust 1.90.0 for macOS arm64. Its SHA-256 is
`07665a52bd48f5a84802bb7319420a74a75bed79e122b45ea29ba6f02b2e5591`.
Independent Sol review verified the earlier dispatcher revision and addon,
replayed Node's 19 cases, and passed extra Bun controls for
split-surrogate metadata, five primitive thrown-value identities and captured
Array-constructor mutation. Direct malicious addon replies for oversized
frames, wrong event kind, offset and count each returned `HOST_JSON_PROTOCOL`.
That review found a P1 in its successor source when typed-array `length` was
mutated. The current dispatcher now uses a validated fixed eight-byte decode;
fresh-addon Node and Bun 20-case runs pass, including the reproduced mutation
against the predecessor. Sol's rereview of this repaired successor is pending.
The pinned review did not qualify default routing or browser behavior.
Relevant source hashes at the tested revision:

| Source | SHA-256 |
| --- | --- |
| `bindings/core/node/src/host_json.rs` | `65ff0ec56e987db946c508d4d84a0f1c32a6f0d23540bc445928e875981c1433` |
| `bindings/core/node/src/host-json.js` | `ab99a6c9455ae42972816d9bd22ab9ce21bdfa096eb4e059ce362a1c72d2f162` |
| `bindings/core/node/src/lib.rs` | `9a32c6b50580adee7487c520597a31e61d5b71497cf21e5e3656b1d5efd356d7` |
| `bindings/core/node/index.js` | `fcb6acdba44a8c20981953893a8ec80eb5d475533b6f8a0f1588b621fbeda76b` |
| `bindings/core/node/index.d.ts` | `19fb6df0c49c50808a44ecf4265fcbd6d9a31dc42a2b8292e7c82d2782924d23` |
| `bindings/core/node/package.json` | `21f541c2032657ac16c818681b8ad41a51a48ce339e2b434e541c629ac2d32bd` |
| `scripts/rust-migration/r8/schema-properties-host-input-node.mjs` | `728075fc1d623b06e8bb43b9db8fa8f4a0984bb982020635974aa2c846b4e26b` |
| `crates/umf-core/src/host_json.rs` | `8e6b59c2cd8bbb4330e99736330f65efe3acf3493ff9a1581e67351675f44600` |
| `crates/umf-core/src/schema_properties.rs` | `d93a7a17e554e8782b05dd4751c122bdf0c888a7a5ffb0aae9c3fcff0cb24f20` |

The frozen result fixture SHA-256 is
`2427c2eb140226a93ac32e25d49a1f60a91582758c620d238dcdd9aaf8506e4a`.
The five resource SHA-256 values, in `coreSchema`, `referenceSchema`,
`packageSchema`, `constraints`, `domainPolicy` order, are `1cef049948bf2c743dacf0348f0f17444e72f81d9a74034ff823429f4c7c4fb1`,
`adca63532b1424637f49f7e2c8e1c35ce68edd71b3904f476d28322e54d24747`,
`3b47c85750357831c13d902c9375a081c8ed97bc16db5df71fb7607523d9cd2a`,
`0972db27e5d272dd4ca6a978e33a55e5e8b0406edc3a01f0856e71de30708c13`, and
`0dd7b527889037d849452410bf662b285a9c74d70ce8f6449e792b02270313cd`.
The predecessor hashes are the ones pinned in the parent Gate0 README. This
records the exercised fixture/resource cohort, not the complete import/build
closure for all predecessor behavior.

The additional typed-array length mutation differential is now part of the
checked-in 20-case harness. The exact successor receipt uses dispatcher
`ab99a6c9…`, adapter `65ff0ec5…`, and addon `07665a52…`; independent rereview
of this exact source cohort remains pending.

This is a narrow Node/N-API adapter check, not complete predecessor parity.
The 20,000-unit test exercises chunking but does not establish large-input
performance or the full resource ceiling. Host controls are unsupported here;
WASM/Chromium and installed-package qualification are not run. The Rust core's
explicit refusal when a live array snapshot passes the predecessor's sparse
test but produces holes remains an unqualified parity gap. The complete
predecessor fixture/resource closure also remains pending. No default route
changes are authorized by this prototype.

## Inherited JSON prototype mutation follow-up

The Node dispatcher previously serialized newly constructed reply wire records
with ordinary object and array prototypes. A source Proxy trap can run during
Rust's staged source traversal and install inherited `toJSON` methods before
the next host reply is encoded. The predecessor does not serialize those
internal replies, so inherited `Object.prototype.toJSON` or
`Array.prototype.toJSON` could replace a valid reply and cause a spurious
`HOST_JSON_PROTOCOL` refusal.

`host-json.js` now creates wire records with null prototypes and transport
arrays whose prototypes are also null before the captured `JSON.stringify`
serializes them. This is private framing only; source reflection and
predecessor-facing result values retain their existing semantics. The R8 Node
harness now exercises a source `getPrototypeOf` trap that installs both
inherited methods mid-traversal. The result matches the frozen declaration
and, under Bun, the live TypeScript predecessor.

The updated harness passes all **21 cases** on Bun 1.4.3 and Node 26.12.1 with
a fresh macOS arm64 debug addon built from this worktree using Rust 1.90.0.
Focused source and binary identities:

| Artifact | SHA-256 |
| --- | --- |
| `bindings/core/node/src/host-json.js` | `3122df6c4ec0211edd164dac63d7041e4fba40c971ff7ef113696f686586b636` |
| `scripts/rust-migration/r8/schema-properties-host-input-node.mjs` | `e4025604202ca84626184bf80c22f3fa67950ec41db03ee357f08fb33f045b98` |
| Fresh `umf_core_node.node` | `f5a2a2f1ad7d2fda9603c7460cfc10d67525301c9fb158eac5b09e575274f929` |

The binary was built with `cargo build --offline -p umf-core-node` into
`/private/tmp/umf-r8-host-json-hardening-target` and copied to an isolated test
package; no shared addon was replaced. Bun and Node both report
`{"cases":21,"status":"pass",...}`. The host-input engine still explicitly
rejects host control callbacks: the JS factory preserves that admission order,
and the current N-API host-json entrypoint has no control-dispatch argument.
Adding cumulative external control accounting needs a separately reviewed
Rust/Node bridge extension. This follow-up does not alter default routing,
qualify WASM/browser behavior, or close the known sparse-snapshot
representability gap.

Independent Sol review verified those three pins plus the current Rust adapter
and core pins, then replayed the checked-in 21-case harness against the
isolated addon in Node 26.12.1 and Bun 1.4.3. Both passed; no new P1/P2 was
found in this focused source/binary cohort. The reviewer hash-checked but did
not rebuild the addon. External controls, dynamic sparse snapshots, complete
resource/predecessor closure, installed routing and WASM/browser qualification
remain open.
