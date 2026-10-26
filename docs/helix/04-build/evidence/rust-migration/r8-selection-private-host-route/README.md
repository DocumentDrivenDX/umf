---
ddx:
  id: umf.evidence.rust-migration.r8-selection-private-host-route
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-reference-host-baseline
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-host-primitive-dispatch
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# Private Selection host route checkpoint

The Node and WASM bindings now expose a private `executeCoreElementSelectionHostJson`
entrypoint. Rust copies the host-owned source before the query, runs the shared
Selection kernel, and asks for `Registry.get` only at the existing lazy lookup
sites. A found registration remains an opaque host handle and stops with
`HOST_JSON_UNSUPPORTED` before Rust reads its caller-owned fields. The default
Node, Bun, browser, and Python package routes are unchanged.

Sol independently reran `cargo test --locked --offline -p umf-core --test
r5_selection` with Rust 1.90.0: 10/10 passed. `cargo check --locked --offline
-p umf-core-wire -p umf-core-node -p umf-core-wasm` passed. Bun 1.4.3 drove a
freshly built Node addon through `bindings/core/node/tests/selection-host-json.test.js`:
3/3 passed, covering the complete frozen R5 `all` value, source/query refusal
before Registry access, exact lookup-throw identity, and a found-registration
stop without member reads. An independent Node 26.12.1 probe matched the
frozen `all` JSON value and preserved a `Registry.get` thrown object's identity:

```sh
UMF_SELECTION_ADDON=/path/to/fresh/umf_core_node.node node scripts/rust-migration/r8/selection-private-host-node.mjs
```

The Node probe also observed that the private binding's decoded result has a
null prototype, while the TypeScript predecessor's result has an ordinary
object prototype. JSON value equality therefore does not establish exact
JavaScript object-shape parity. This difference is an explicit default-route
gate. The WASM target compiled with `cargo check --target wasm32-unknown-unknown
-p umf-core-wasm`, but a real Chromium execution of this new entrypoint has
not run: `wasm-bindgen` and `wasm-pack` are unavailable in the local toolchain,
and the checked-in WASM glue predates the new export.

The route remains private. Caller-owned `structure` and `semantics` execution,
callback diagnostic materialization, final `UmfError` construction, native
resource charging, real browser parity, public default selection, installed
archive qualification, and semantic retirement remain open.

## Bounded caller-registration structure stage — 2026-10-26

The private host route now advances a found registration through the
predecessor-observed `manifest.scopes.includes(scope)` check and, when in scope,
the `structure(payload)` call. Both reads and calls use the opaque host protocol
at the Rust validation demand site; `includes` receives the scopes value as its
receiver and `structure` receives the registration object as its receiver.
Manifest and structure properties are reread at the predecessor's later stages.
An out-of-scope result produces the existing scope diagnostic without reading
`structure`. A structurally valid non-semantic registration produces the
existing unchecked diagnostic. Empty structure-error iteration follows the
predecessor's no-diagnostic continuation. A non-empty structure-error sequence
is fully observed in iterator order, then stops because mixed structure
diagnostic materialization is not yet implemented. A semantic registration
stops after reading its semantic callback property; the callback is never
invoked. Caller-owned getter, Proxy, call, or iterator throws continue through
the existing exact-identity host slot.

Focused Node binding controls cover scope-before-structure order, receiver
preservation, malformed-structure iteration, structure getter identity, and the
semantic callback boundary. `cargo check --locked --offline -p umf-core`,
`cargo test --locked --offline -p umf-core --test r5_selection` (10/10), and
`cargo check --locked --offline --target wasm32-unknown-unknown -p umf-core-wasm`
pass on Rust 1.90.0. The Node addon was rebuilt to a temporary target directory
and the focused file passes 7/7 on Bun 1.4.3. The independent Node 26.12.1
private-route probe passes its two frozen-value and thrown-identity cases.
Chromium did not run this Selection route; the existing Chromium receipts remain
host-primitive evidence only. This checkpoint does not establish complete
Selection parity, default-route selection, or release qualification.
