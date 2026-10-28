---
ddx:
  id: umf.evidence.rust-migration.r8-sec-default-broad-installed-sdk-20261028
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-sec-projection-default-installed
      kind: references
    - id: ADR-006
      kind: informed_by
---

# Broad installed SDK replay after SEC default selection

On 2026-10-28, the zero-transform private Darwin arm64 archive
`6cace7b4dcca7dd7684349754f2633597d5a9c6afe959c73047a9b89b260fe9f`
passed the broad installed SDK replay on Node 26.12.1, Bun 1.4.3, and real
Chromium 153.0.8010.12. The archive source closure SHA-256 is
`1ba919b661ae36490b6f633dcafb9fe106c6c58d122a0881122e55fde7ff9031`;
its 1,813 archive members and 1,806 assets were checked. The
[machine-readable receipt](darwin-arm64-sdk-receipt.json) has SHA-256
`6c60d95abce300d497f0743e69ad95081a4fc0bb3b62f948471010b0574be668`.

The replay covers 31 frozen R3 generator cases; named numeric (27 cases plus
six boundaries), cardinality (66), facets (19), keys (14), Bit128 (11), and
Compact Dataset (19) subsets; and 68 Security And/Or cases with 30 valid Rust
calls per host. It verifies the V4 root and explicit `./reference` package
conditions, refuses three route-tamper mutations, and refuses missing/corrupt
native and WASM assets. The installed package exposes 1,123 root exports. The
separate [SEC default-route packet](../r8-sec-projection-default-installed/README.md)
uses the same archive and source closure for SEC projection parity and the
exact 32 Mi UTF-16 output boundary.

Reproduce from the repository root after building the pinned archive:

```sh
bun scripts/test-sdk-rust-default.ts
```

This is one private Darwin arm64 installed cohort for the named operations and
controls. It does not establish complete SDK parity, hosted Linux qualification,
declaration retirement, Python release qualification, or a publishable UMF
release.
