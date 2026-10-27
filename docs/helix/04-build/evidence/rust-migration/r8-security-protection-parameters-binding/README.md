---
ddx:
  id: umf.evidence.rust-migration.r8-security-protection-parameters-binding
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
    - id: umf.evidence.rust-migration.r8-security-protection-parameters
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-protection-query-properties
      kind: informed_by
---

# R8 opt-in protection parameter binding

This receipt records an opt-in Node N-API and WASM binding for the existing
Rust validate_security_protection_parameters_candidate core operation. The
public factory is createSecurityProtectionParametersEngine; its versioned
wire profile is umf.security-parameters/1. It is separate from
umf.security-queries/1 and umf.security-functions/1. No default package
root or TypeScript export is changed.

The operation checks typed transform parameter and range-bucket literals
against the exact retained Field, using existing core literal admission. It
returns validated-parameters or refused, and always reports
complete:false and authority:false. It does not assign function
parameter names, arity, type compatibility, output behavior, policy
interpretation, authorization, or native enforcement.

## Frozen predecessor and supported subset

The TypeScript predecessor packet in
[r8-security-protection-parameters](../r8-security-protection-parameters/README.md)
contains 11 cases. The tagged operation replays the eight JSON-compatible
cases exactly: valid integer plus range bucket, literal-family mismatch,
numeric expansion boundary, canonical literal size, parameter-count boundary,
and unknown catalog, policy, or core content. It also replays the
supplemental cumulative normalized-text budget and diagnostic-order packets.
Unknown content remains in retained source snapshots while blocking
interpretation.

Three predecessor cases are explicitly outside exact tagged parity:

| Case | Boundary |
| --- | --- |
| Noncanonical integer token | Native schema validation collapses nested oneOf diagnostics; the TypeScript predecessor reports all branch diagnostics. Rust remains fail-closed, but diagnostic-array parity is not claimed. |
| Pre-spent literal helper budget | This exercises an internal TypeScript composition helper and cannot be represented by the public tagged request. |
| Policy accessor | A tagged JSON value cannot represent a JavaScript accessor. Host admission rejects the getter without invoking it; this is tested separately. |

The Rust candidate supports a narrow Field subset. Repeated/container Fields
and non-integer/non-decimal Fields refuse as unimplemented. The operation
does not coerce literals or compare them through JSON equality.

## Host qualification

The frozen predecessor was checked with Bun 1.4.3. A fresh Rust 1.90.0
umf-core-node release addon and the facade replayed the eight tagged cases
under Node 26.12.1 and Bun 1.4.3. Both matched the full frozen result, including
retained policy/catalog/closure snapshots, diagnostic order, validated
coordinates, and the false completion/authority flags. Both rejected an
enumerable accessor without invoking its getter.

A fresh Rust 1.90.0 wasm32-unknown-unknown release build with
wasm-bindgen 0.2.100 replayed the same eight cases in Chromium
153.0.8010.12. The browser result matched the frozen predecessor and checked
accessor refusal, missing ABI refusal, corrupt ABI refusal, and absence of
Node globals.

The isolated Node and Bun replay used a temporary addon built from the current
source tree; it did not replace the checked-in native binary. The Chromium
replay used a temporary WASM package output. These results qualify this
captured source cohort only. Package archive or installed-route replay is
separate evidence.

Focused validation:

    bun scripts/rust-migration/r8/security-protection-parameters-predecessor.ts --check
    PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH CARGO_TARGET_DIR=/private/tmp/umf-security-parameters-target cargo test --locked -p umf-core-wire security_parameters_binding --lib

The predecessor check passed with 11 cases; the Rust wire suite passed 5/5.
The Node and Bun host replays each passed 8/8 tagged cases. The Chromium replay
passed 8/8 tagged cases and all listed host controls. See
[security-protection-parameters-binding-browser.mjs](../../../../../../scripts/rust-migration/r8/security-protection-parameters-binding-browser.mjs)
for the reproducible browser harness. Set
UMF_SECURITY_PROTECTION_PARAMETERS_WASM_PKG to fresh wasm-bindgen web output
when running it.

Contract source limits remain 32 parameters, 4096 canonical UTF-16 units per
literal, and 256 transforms. The private typed-literal/property ledgers allow
100,000 work units and 100,000 normalized text units per check; exhaustion
refuses without trimming. Core document validation and domain indexing happen
before these ledgers and retain separate limits. This is not a total heap or
CPU bound.
