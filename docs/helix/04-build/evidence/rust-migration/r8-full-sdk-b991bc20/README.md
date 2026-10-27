---
ddx:
  id: umf.evidence.rust-migration.r8-full-sdk-b991bc20
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-full-sdk-9b89b757
      kind: references
    - id: umf.evidence.rust-migration.r8-security-and-or-v4-source-replay-current
      kind: references
---

# Installed SDK replay on fixed-point source b991bc20

The [installed replay receipt](installed-test-receipt.json), SHA-256
`0fed52e384d272416edbccff2e462750bdde893d3e5c5f891bacd2fcb6632d2e`, records
a pass for the private macOS arm64 archive with SHA-256
`b6288048969bc163255064fe7c391fd8043b6e3bcfb6e4b0817e24aa65c62dc6` and
fixed-point source closure
`b991bc20731f42efd3a73aebd922f8cea7c6927346a63e197e467cf9f1eb028f`. The
[package receipt](package-receipt.json), [archive manifest](archive-manifest.json),
and [preflight](preflight.json) bind the package to that same archive and
closure. Preflight verified all 1,806 payload member hashes, the 1,807 tar
members, and 3,549 current source inputs; the source transform count is zero.

`bun scripts/test-sdk-rust-default.ts` passed from the installed archive in
1,223,817 ms on Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. The
receipt records 31 R3 cases, 27 JavaScript numeric cases and six boundary
cases, 66 Cardinality cases, 19 Facets, 14 Keys, 11 Bits128, 19 Compact
Dataset cases, and 1,120 exports. The 68-case Security And/Or installed packet
also passed with 30 valid Rust/WASM calls on each host. The replay recorded
three route-tampering refusals and missing/corrupt native and WASM asset
refusals. Its companion [Security And/Or receipt](security-and-or-installed-receipt.json)
binds that subset to the same archive and source closure.

This is one private macOS arm64 execution cohort. No macOS CI ran; Linux x64,
hosted cross-platform parity, and the coordinated release matrix remain
unqualified. The current R8 ledger still has 922 open logical default-route
gaps and zero retired. The SDK package is private and not publishable; this
packet does not establish R8 completion, release eligibility, publication, or
consumer adoption.

The retained records are exact copies of the build and installed receipts,
plus independently regenerated preflight outputs for this archive. [SHA256SUMS](SHA256SUMS)
pins every packet file except itself.
