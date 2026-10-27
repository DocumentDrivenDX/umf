---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-raw-host-probe
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
    - id: umf.evidence.rust-migration.r8-json-value-serialization
      kind: informed_by
---

# R8 `readJsonValue` raw-host admission probe

This probe stops before source selection. It compares the current default Node
and browser entry exports with `./reference`, then calls the opt-in Rust
`createEngine().readJsonValue` route directly on the same unusual host values.
The Node harness is
[`read-json-value-raw-host-probe.mjs`](../../../../../../scripts/rust-migration/r8/read-json-value-raw-host-probe.mjs);
the real-Chromium harness is
[`read-json-value-raw-host-browser.mjs`](../../../../../../scripts/rust-migration/r8/read-json-value-raw-host-browser.mjs).

The frozen 11-case raw-host cohort exercises `undefined`, `null`, number,
boolean, symbol and plain-object text arguments; a throwing `length` getter and
its exception identity; Proxy property-access order; and object, numeric and
symbol `format` fallback. Node 26.12.1 and Bun 1.4.3 receipts show that default
and reference routes match each other in all eleven cases. The exact Rust
candidate route matches only the three format-fallback cases and mismatches the
eight non-string text cases. In particular, TypeScript reads `text.length`
before parser admission, propagates the identical exception from a throwing
getter, and produces the parser's `TypeError` for other non-string values. The
Rust facade instead performs JSON host admission first: it can return `NON_JSON`
or `SOURCE`, does not invoke the getter, and produces a different Proxy trace.

This is a blocking source-selection mismatch. Keep the default route on
TypeScript until a host admission adapter reproduces these observations before
calling Rust. The 24-case predecessor packet remains useful for the string
subset, but it does not cover these raw-host inputs.

The real-Chromium harness was attempted with the existing current-source WASM
package and export-call instrumentation. It did not produce a parity receipt:
the generated WASM initializer reported `WebAssembly.instantiate(): BufferSource
argument is empty`. This attempt is not browser behavior evidence. The Rust
candidate's direct Node and Bun mismatches are sufficient to stop selection.

## Source closure

The existing Rust serialization implementation is the one pinned in the
R8 JSON-compatible serialization packet. The tagged wire and host facade
sources at this probe are:

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/serialization.rs` | `6dcb0ec4fb47e0aa6d5cb545b0cd925b9a1b23838a3782f435386af5a497c392` |
| `crates/umf-core-wire/src/lib.rs` | `fb1d0a56acb5c38fa79d0a90b3183a07e47502c454e10b1aa0c010fc194803ab` |
| `bindings/core/node/index.js` | `1de555d59ef8793f1b2c493d00c2d4625151cf08ce488604a9cd1f1dd3bcaa18` |
| `bindings/core/wasm/index.js` | `0643ce8f38004185cdf646e233ac2234d82872782e960b9917971afeef7f87f8` |
| Node probe | `49402518511578b3a354c806a3b57dcef5dec1c7a29d11653076ce13a6f5bad7` |
| Chromium probe | `77fd1279fce9adb258ca8b53dc26c95b040db4a39e3dce4ee32786c41ba0a3b2` |

These selected hashes identify probe inputs and are not a transitive source
closure or installed-package qualification. No source-selection, TypeScript
retirement, release, or full-port claim follows from this packet.
