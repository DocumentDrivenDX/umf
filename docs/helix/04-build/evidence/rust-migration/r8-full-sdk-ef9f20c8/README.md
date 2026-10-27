---
ddx:
  id: umf.evidence.rust-migration.r8-full-sdk-ef9f20c8
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-compact-dataset-verify-installed-ef9f20c8
      kind: references
    - id: umf.evidence.rust-migration.r8-security-and-or-installed-ef9f20c8
      kind: references
---

# Installed SDK replay on ef9f20c8

The [full installed test receipt](installed-test-receipt.json), SHA-256
`c3f45aaedc3a404a07a44922290c04afbb616a0f82179efe331e83d646ae3c7c`, records
`passed` for archive SHA-256
`3302afe1837647344b6fa08606f31cc61a88637d3897f15feb6cb218c01c4046`, fixed-point
source closure
`ef9f20c85e220651590552b94e92da0743d02f5a97446b1e2f51f5781e244ecb`, and
zero source transforms. The suite verified 1,806 archive members and completed
in 1,133,333 ms on a private macOS arm64 cohort using Node 26.12.1, Bun 1.4.3,
and Chromium 153.0.8010.12.

The installed run passed 31 R3 cases and reported all host, package, missing
and corrupt native/WASM, and route-tamper controls. It also ran 68 installed
Security And/Or cases with 30 valid native/WASM calls per host, alongside the
broader numeric, cardinality, facets, keys, Bits128, Compact validation, and
export inventory checks recorded in the raw receipt. The separately recorded
installed Compact verifier packet passed five cases and its host controls.

This is one private macOS arm64 installed cohort, not release qualification.
The R8 ledger still has 922 open logical default-route gaps and zero retired.
