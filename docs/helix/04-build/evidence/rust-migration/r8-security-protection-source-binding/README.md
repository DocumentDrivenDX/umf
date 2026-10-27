---
ddx:
  id: umf.evidence.rust-migration.r8-security-protection-source-binding
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-protection-resolution
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: CONTRACT-063
      kind: informed_by
---

# Opt-in source-resolution Node/WASM binding

This evidence covers the opt-in `umf.security-protection-source/1` binding for
`resolveSecurityProtectionSources`. It uses the existing Rust source resolver
and tagged wire operation; the Node and WASM public factories each select only
that operation. The 10 `stage: source` rows from the frozen predecessor packet
are replayed through both hosts. Retention is checked by exact canonical
comparison of policy and catalog snapshots as well as the packet summary.

Node 26.12.1, Bun 1.4.3, and headless Chromium 153 passed the exact 10-case
replay. The Node tests also verified accessor rejection without getter
invocation and wrong-profile/unknown-member wire refusal. Chromium verified
missing and malformed ABI refusal, accessor rejection, and absence of Node
globals. Receipts are in [`node.json`](node.json), [`bun.json`](bun.json), and
[`chromium.json`](chromium.json). `bun scripts/rust-migration/r7/wasm-package-sources.ts --check`
passed. The WASM build used target `wasm32-unknown-unknown`, release profile,
and wasm-bindgen CLI 0.2.100 matching the crate schema.

This remains `complete: false` and `authority: false`. The supported subset is
only those ten frozen tagged source cases plus one raw-host accessor control.
No default route, policy or catalog interpretation, authorization, security
decision, domain resolution, or ledger retirement is claimed. The distinct
domain and interpretation work remains governed by its existing boundaries.

## Pinned local digests

- Frozen predecessor packet: `e05218e5b98cf2fe1b2c3b95f62d2559a85b0346e71fe933f796aa9bc26b000e`
- Node factory: `be148feb96f65f7bc2b1fc7efd49602a1dd75a7ac1270a4eab856b5a8059d474`
- WASM factory: `be148feb96f65f7bc2b1fc7efd49602a1dd75a7ac1270a4eab856b5a8059d474`
- Node public entry: `461bbac1960f9fbe7d7da3cddb721e466bd13698562b0ccb0c8716b859c743d6`
- WASM public entry: `722ca58eaa8cdcf7db3ea2c08ac9ffdaaa688b5e473255cd31562b4b880181e4`
- Node binding source: `b7a7d2fe69b4d743a0ca86600666383ebe7e96e2badb9695687e95f28a16a0b2`
- WASM binding source: `18d3e5034605ae99ad98fdacb5976e23cd023fafdeced6f930900465d9f64062`
- Node/Bun receipt runner: `4234708e5ce4586bf567df3842676d56c6b8d83615a7ca2b3a004b230fc6d7f8`
- Chromium receipt runner: `185dec9859c67c84126958f655631bdc001701136628ca3fa89897d10f9053be`
- Shared-source manifest: `52057002edb895adbb755eb5332645155ac2c3b61992a191fe7122a86edf8f4b`
