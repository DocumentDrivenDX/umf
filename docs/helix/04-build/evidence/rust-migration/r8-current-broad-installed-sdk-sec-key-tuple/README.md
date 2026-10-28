---
ddx:
  id: umf.evidence.rust-migration.r8-current-broad-installed-sdk-sec-key-tuple
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
---

# R8 broad installed SDK replay: SEC and Key Tuple source closure

The [Darwin arm64 receipt](darwin-arm64-receipt.json), SHA-256
`cca83996200bba94609dba46a0d3a43505fe43fe6a8a3b44cdac3e901ccba6b7`,
passes `bun scripts/test-sdk-rust-default.ts` against fixed-point archive
`996dd7c991ccc068bfbf58e21709d01e3babf238e4ef23ca01cf6f7f63cce9ed`.
Its source closure is
`8227af60468cb93bc6f495aaccee14876f4698204ccfb26f2ee6629e2fac836c`,
with zero source transforms. The harness verified 1,813 archive members and
1,806 assets, plus exact package routes and three tamper refusals.

Installed Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 passed
the 31-case R3 generator replay, 27 JavaScript numeric cases and six numeric
boundaries, 66 cardinality, 19 facets, 14 keys, 11 Bit128, and 19 Compact
Dataset cases. The companion Security And/Or packet covers 68 cases and 30
valid Rust/WASM calls per host. Missing and corrupt native/WASM assets refused.
The runtime root has 1,123 exports, including the three new opt-in SEC and
Protobuf candidate functions; the `./reference` export set remains at 1,120.

This is a private local installed cohort. It does not establish Linux host
parity, full declaration retirement, or release qualification. The R8 ledger
still records 922 open logical default-route gaps and zero retirements.
