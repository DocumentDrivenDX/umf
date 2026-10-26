---
ddx:
  id: umf.evidence.rust-migration.r8-selection-opaque-return-carrier
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-callback-trace
      kind: continues
    - id: umf.evidence.rust-migration.r8-selection-spread-boundary
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Private Selection opaque return carrier

This slice adds a private host-protocol primitive for returning a caller-owned
object or function from a Rust-directed operation without JSON materialization.
Rust invokes the supplied function through `InvokeOpaque` and returns a tagged
invocation-local handle. The Node and WASM wrappers require the handle to exist
in the current invocation map, resolve it to the original value, and then
release the map. The host invocation receiver and argument are preserved, and
thrown values continue through the shared identity slot. Primitive return
values are refused with `HOST_JSON_UNSUPPORTED`.

The primitive makes the result boundary needed by a future staged
`Registry.kindRuntime.validateDocument` route concrete. The tested callback is
`validateDocument`-shaped, but this work does not implement the `kindRuntime`
property/method access sequence, registration-array construction, validation
delegation, or complete behavior parity. It does not change either V4 default
route or claim any reduction to the 922 default-route retirement gaps.

## Evidence

The focused Rust suite passes three cases: exact function/receiver/argument
event and object/function carrier output, refusal of primitive returns, and
refusal of an unexpected host reply. The focused Bun binding suite passes
17/17, including original object identity, thrown-value identity, and rejection
of a forged handle outside the active invocation.

Node 26.12.1 and Bun 1.4.3 each pass the 21-case same-host TypeScript Selection
comparison with 21/21 exact outcomes and 21/21 exact host traces. The runner
also checks returned-object and thrown-value identity through the private
carrier. Real Chromium 153.0.8010.12, using a fresh WASM build from Rust
1.90.0 and wasm-bindgen 0.2.100, passes the same 21/21 outcome and trace cases
and both carrier identity checks. The focused addon SHA-256 is
`d90bffe0bf23190a02e2ab0203e60b6ed496b0e4e316d547e5a1734b45efa01b`; the
browser WASM SHA-256 is
`b4807a1798ab4a4ac7ba2eaa12138903d4a0b6a68cf7f178172f1cef3925e861`.

The final [Node](node.json), [Bun](bun.json), and [Chromium](chromium.json)
receipts were captured after regenerating the metamodel, Python action/codegen
resources, and R8 inventory/ledger to a checked fixed point. Each receipt pins
28 source inputs; Sol verified zero hash drift against the reviewed tree. The
browser receipt includes the fresh WASM and bundle hashes. These are private
binding receipts, not installed package or release receipts.

The carrier currently supports only object and function handles. It does not
establish primitive, symbol, or bigint return transport; arbitrary host parity;
full `Registry.kindRuntime` integration; resource-accounting parity; installed
package or release qualification; V4 routing; or retirement of any default
route gap.
