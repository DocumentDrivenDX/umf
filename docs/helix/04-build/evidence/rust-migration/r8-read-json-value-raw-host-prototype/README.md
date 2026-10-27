---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-raw-host-prototype
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
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
---

# R8 raw-host JSON read prototype

The baseline packet at
[`r8-read-json-value-raw-host-probe`](../r8-read-json-value-raw-host-probe/README.md)
showed that the existing Rust engine route failed 8 of 11 cases before parsing:
source admission serialized arbitrary values before matching the TypeScript
boundary. A Rust-owned admission prototype now matches all 11 cases in Node
26.12.1 and Bun 1.4.3 through both a throwaway N-API addon and a separately
compiled `wasm-bindgen` Node target. Each run produced zero mismatches against
both the reference and default TypeScript routes.

The Rust operation owns admission order and type selection. Small host callbacks
perform only the JavaScript `text.length > 100_000` and subsequent `text.length`
operations. This preserves engine-native TypeErrors, Proxy getter order, and
the identity of exceptions thrown by a `length` getter. Rust then parses valid
text with `read_typescript_json_value`; format selection remains exact-match
`"json"`, with every other value falling back to YAML. The prototype lives
under `scripts/rust-migration/r8/read-json-value-raw-host-prototype/`; its two
buildable crates are standalone probes and do not edit current binding sources,
V4 entrypoints, package construction, or tracked archive inputs.

The same source also compiles to browser-target WASM with pinned wasm-bindgen
0.2.100 and emits web glue. An elevated local harness loaded that glue in
HeadlessChrome 153.0.0.0; all 11 cases matched the reference and default
TypeScript routes, and the browser instrumentation recorded exactly one Rust
export call per case. This demonstrates browser prototype parity and Rust
dispatch for the bounded admission matrix, not production binding integration.

The 11-case check does not cover every possible non-string `length` value,
long-source error-envelope mapping, malformed input diagnostic parity, or
isolated UTF-16 in returned strings. The N-API length-limit error shape and
WASM parse-error conversion are prototype-level and need integration before
any public support claim. The browser run used a local elevated Playwright
harness; it is not hosted browser evidence or an installed-SDK qualification.
