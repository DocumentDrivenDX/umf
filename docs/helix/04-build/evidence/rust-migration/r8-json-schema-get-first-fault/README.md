---
ddx:
  id: umf.evidence.rust-migration.r8-json-schema-get-first-fault
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
---

# R8 JSON Schema `get` first-fault qualification

## Qualified cut

`getJsonSchemaNode(document, pointer)` validates the document payload before
examining the pointer in the TypeScript predecessor. The Rust binding previously
checked a non-string pointer first, changing the reported fault when both inputs
were invalid. Its Node and WASM wrappers now issue the private wire operation
`validateJsonSchemaDocumentForGet` only when `pointer` is non-string. Rust runs
`schema::payload_from_document` (or the prepared-runtime counterpart) and
returns an inert success value before the wrapper invokes the native
`pointer.startsWith` check. The ordinary string-pointer path remains one Rust
wire call. `editJsonSchemaNode` retains its pointer-first predecessor order.

This is a scoped opt-in CONTRACT-002 binding correction. It does not alter
package default routing or establish full JSON Schema parity.

## Evidence

The focused wire test passes 8/8 and the Node/WASM wrapper suite passes 23/23.
Fresh Node 26.12.1 native-addon and Headless Chromium 153.0.8010.12 WASM
replays both match the predecessor's exact `INVALID_DOCUMENT` error for `{}`
with pointer `7`. The Chromium replay also confirms that a Proxy document's
`ownKeys` sentinel is observed before the pointer getter and that the exact
sentinel object escapes both predecessor and WASM binding. Both real bindings
match the predecessor's pointer-first `TypeError` for `editJsonSchemaNode({},
7, 'false')`. Full host outcomes are recorded in [the Node replay](node-replay.json)
and [the Chromium replay](chromium-replay.json); source, build, and runtime
hashes are in [the receipt](receipt.json).

The native addon and browser WASM were built from the recorded current worktree
sources with Rust 1.90.0 and wasm-bindgen 0.2.100. The predecessor was bundled
from current TypeScript source with Bun 1.4.3 and executed in each host runtime.
The checked-in `bindings/core/wasm/pkg` and Node addon are not the artifacts used
for this replay; the fresh artifacts live under `/private/tmp` and their hashes
are pinned in the receipt.

## Limits

The validation-only wire operation adds a second Rust call for non-string `get`
pointers. The admission object is reused, so host controls observe the extra
request/response work; exact budget-boundary equivalence for that extra call was
not tested. Proxy identity is qualified for the tested host serialization trap,
not for all proxies or all marshalling effects. This evidence covers only the
crossed invalid-document/non-string-pointer fault, the tested Proxy ordering,
and edit pointer-first behavior. It does not qualify arbitrary non-string
pointer objects, all pointer failures, the full adapter, package default routes,
or a general Rust source-closure claim.
