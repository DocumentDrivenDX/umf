---
ddx:
  id: umf.evidence.rust-migration.r8-security-not-default-cutover
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-truth-logic-binding
      kind: extends
    - id: TP-001
      kind: informed_by
---

# R8 `securityNot` default-route parity gate

## Decision

`securityNot` remains TypeScript-selected in the default Node and browser roots.
The direct host comparison does not establish parity for invalid values, and no
installed-package or fresh Chromium comparison was obtained. The three valid
truth inputs match on both local hosts; the required error-class and host-effect
comparison fails on invalid values. The private factory stays opt-in.

The TypeScript source is `src/extensions/security/logic.ts` (SHA-256
`df5857cf39f924552a8082f87d911b81725cce0cf1fda4375daeeb07dd48c8c8`). Its
`truth()` check uses scalar equality and throws `UmfError` with code
`SECURITY_TRUTH`, message `Invalid security truth`, and empty path. The Rust
operation is `umf_core::security_logic::security_not` in
`crates/umf-core/src/security_logic.rs`; the binding profile is
`umf.security-logic/1.0.0`, exposed by `createSecurityLogicEngine` from the
Node/WASM binding roots. The binding encodes `{value}` through generic wire
admission before Rust checks the truth token. `src/index.ts` exports the
TypeScript implementation; `src/index-node-v4.ts` and
`src/index-browser-v4.ts` inherit it through `export * from './index'` and do
not select the Rust factory for this operation.

## Frozen direct comparison

The harness is `scripts/rust-migration/r8/security-not-parity.mjs`. Bun 1.4.3
imports the TypeScript source directly and the current Node binding. Node
26.12.1 imports a Bun-built bundle of that same pinned TypeScript source plus
the current Node binding. Each host compares return values, thrown class/name,
code, message, path, and a trace of getter/Proxy effects over 14 cases. Raw rows
are preserved in [`bun.json`](bun.json) and [`node.json`](node.json).

| Host | Exact case matches | Cases | Finding |
| --- | ---: | ---: | --- |
| Node 26.12.1 | 3 | 14 | Only `T`, `F`, `U` match exactly. |
| Bun 1.4.3 | 3 | 14 | Only `T`, `F`, `U` match exactly. |

For `null`, numbers, booleans, an unknown string, arrays, plain objects, and
null-prototype objects, both routes report `SECURITY_TRUTH`, the same message,
and an empty path. The thrown classes differ: TypeScript reports `UmfError`,
while Rust reports `UmfCoreError`. An enumerable accessor input is rejected by
Rust admission as `ACCESSOR_PROPERTY` at `/args/value/member`; TypeScript does
not read the property and reports `SECURITY_TRUTH`. The `ownKeys` and
`getPrototypeOf` Proxy traps throw through the Rust route and are absent on the
TypeScript route. A Proxy with only a `get` trap is not read by either route.

This is an observable host and error-contract difference even though the
operation's three valid truth values agree. Correcting it requires an explicit
compatibility admission layer or a reviewed contract/support-boundary change;
merely changing the root export would silently alter behavior.

## Browser and package gates

The fresh release WASM build used Rust 1.90.0 and wasm-bindgen 0.2.100. A
Playwright Chromium launch failed when macOS denied the headless shell's MachPort
rendezvous. The Chrome extension-backed browser then rejected the local `file:`
test page and explicitly disallowed local-server, indirect, CDP, or alternate-
browser workarounds. The exact outcome is in [`browser-attempt.json`](browser-attempt.json).
Therefore this slice has no new direct TypeScript-versus-WASM Chromium receipt.
The earlier real Chromium 153.0.8010.12 receipt in the opt-in binding evidence
covers the frozen truth/composition fixtures and controls, not this raw-host
comparison.

No installed SDK package replay was run. The public package roots still select
TypeScript for these exports, and the local Node binding result already fails
parity; a source binding check cannot qualify an installed package default
route. Fresh package/archive evidence remains required after the compatibility
boundary is resolved.

## Existing checks and pins

The focused Node binding tests pass 4/4 under Node 26.12.1 and Bun 1.4.3.
Those tests establish the opt-in factory's frozen fixture behavior, not default
export parity. CONTRACT-062 is pinned at SHA-256
`1183e2ea8ba55fade4007554905b7175d7796e867a67814f511e9cd3ee514800`; the
existing opt-in receipt and its Rust 1.90 / WASM 0.2.100 test details are in
[`r8-security-truth-logic-binding`](../r8-security-truth-logic-binding/README.md).
The extension contract's proposed `umf.security` 0.1.0 version and the
standalone binding profile `umf.security-logic/1.0.0` remain distinct claims.

No public export or default-root selection changed in this slice.
