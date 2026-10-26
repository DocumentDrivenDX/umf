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

The original Node probe captured a null-prototype decoded result. A later
ordinary-object projection was assumed to match TypeScript, but a direct
`selectCoreElements` probe disproved that assumption: `copyJson` returns
null-prototype objects. The current Selection-only projection now preserves
that shape. The WASM target compiled with
`cargo check --target wasm32-unknown-unknown -p umf-core-wasm`, but a real
Chromium execution had not yet run at that earlier checkpoint because the
checked-in WASM glue predated the new export.

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
private-route probe passes its frozen-value and thrown-identity cases. At this
checkpoint Chromium had not run this Selection route; the later real-browser
execution below supersedes that limitation. This checkpoint does not establish
complete Selection parity, default-route selection, or release qualification.

The [mixed-diagnostic interface decision](mixed-diagnostic-interface-decision-20261026.md)
records the earlier static `Validation` limitation and the ordered host carrier
gate subsequently implemented in the private invalid-source branch below.

## Real Chromium execution — 2026-10-26

[`chromium.json`](chromium.json) records a fresh offline build of the private
`executeCoreElementSelectionHostJson` WASM export, followed by execution in
Chromium 153.0.8010.12. Seven frozen R5 queries (`all`, `categoryAnd`,
`emptyCategory`, `unknownScalar`, `repeatedEdges`, `cyclicTraversal`, and
`emptyTraversal`) matched their TypeScript predecessor JSON values. A browser
`Registry.get` sentinel was thrown on the first lookup and arrived with exact
object identity (`calls: 1`, `thrownIdentity: true`). The receipt binds the
fresh wasm32 artifact and glue to hashes for the Rust selection kernel, private
WASM host bridge, host protocol, frozen inputs, schemas, generated resources,
and harness sources.

All seven decoded result roots and nested objects had null prototypes, and
arrays retained `Array.prototype`, matching direct TypeScript `copyJson`.
A separate source case preserved an own `__proto__` data key without changing
the null prototype or polluting `Object.prototype`. At that checkpoint, the
evidence remained limited to seven frozen query cases, one own-`__proto__` case,
and one thrown-identity case; later successful warning evidence follows below.

Reproduce from the repository root with:

```sh
bun scripts/rust-migration/r8/selection-private-host-browser.mjs
```

The harness uses the pinned Rust 1.90.0 toolchain and `wasm-bindgen 0.2.100`
offline, then launches real Chromium. Its runtime versions, case outcomes,
artifact hashes, and shape finding are in the JSON receipt.

## Private invalid-source mixed diagnostics — 2026-10-26

The private Node route now carries nonempty structure errors through a typed
constraint result and a private Engine packet. It preserves host message string
tokens and exact insertion order beside static diagnostics. Selection runs the
ordered validity check, then asks the host for one aggregate
`JSON.stringify` of the mixed array and returns `CORE_SELECTION_SOURCE` with
the native Error carrier's message. A nonstring structure message refuses at
constraint `emit` as `CONSTRAINT_DIAGNOSTIC`, before later registrations.
The public static `Validation` route continues to require static diagnostics.

A fresh Node addon passes the ten focused Bun-driven binding tests. The
invalid-source fixture contains two structure errors at each of two extension
sites followed by two static warnings; its exact serialized message and single
host stringify are pinned. The suite also covers proxy getter and iterator
throw identity, nonstring early-stop order, and a lone-surrogate native refusal
message. The Node 26.12.1 private probe,
six focused Rust packet tests, ten frozen R5 Selection tests, Node/WASM event
serializer tests, and a `wasm32-unknown-unknown` compile check pass. Real
Chromium now confirms the frozen results, nested object prototypes, own
`__proto__` preservation, and Registry exception identity. Successful results
containing host-owned warning diagnostics, semantic callbacks, full event parity,
and installed package qualification remain open. The route is private and does
not retire a default export.

## Successful structure-warning diagnostics — 2026-10-26

The private success branch now materializes the captured ordered diagnostic
packet into `sourceValidation`, resolving retained host string tokens only at
that return boundary. It preserves static and structure warnings in one
diagnostic list and does not call aggregate `JSON.stringify` on the successful
path. A synthetic invocation policy sets `domainPolicy.extensions.structure`
severity to `warning` so the branch can be exercised without changing the
checked-in policy. Node/Bun verifies the exact six-entry order against a direct
TypeScript predecessor run in a fresh Bun subprocess, null result prototypes,
zero diagnostic-array stringifications and all earlier refusal controls. A
4,000,001 UTF-16-unit warning message trips the Text-unit limit.
[`chromium.json`](chromium.json) records the same six entries matching the
cross-host direct-source baseline, with null prototype, in Chromium
153.0.8010.12 against a fresh wasm32 artifact;
the seven frozen query values, own `__proto__` preservation, and Registry throw
identity still pass.

The synthetic warning-policy receipt does not claim that the checked-in policy
emits structure warnings; its structure severity is `error`. Direct source
execution occurs in a fresh Bun child process because the policy object is
deliberately frozen in normal operation. Chromium compares against that
cross-host direct-source baseline; direct TypeScript itself does not run in the
browser. Semantic callback diagnostics, resource-boundary parity beyond this
string path, installed-package qualification, and public/default route
selection remain open.
