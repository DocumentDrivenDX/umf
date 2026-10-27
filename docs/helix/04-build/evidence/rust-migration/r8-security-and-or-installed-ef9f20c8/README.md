---
ddx:
  id: umf.evidence.rust-migration.r8-security-and-or-installed-ef9f20c8
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
    - id: umf.evidence.rust-migration.r8-security-and-or-v4-source-replay-current
      kind: extends
---

# Installed Security And/Or replay on ef9f20c8

The [installed receipt](security-replay.json), SHA-256 `7d93631143e018fed08ce3f669a7b89c13f4f60502650052fb0b4096b49f91c5`, binds the exercised installation byte-for-byte to the SDK archive at `.cache/sdk-distribution/cohorts/ef9f20c8/umf-sdk.tgz`. Archive SHA-256 is `3302afe1837647344b6fa08606f31cc61a88637d3897f15feb6cb218c01c4046`; manifest SHA-256 is `a3317d5edd5a3971904899f14f1050b441b029dfd9ee0bafeecaaecd643d17ab`; fixed-point source closure is `ef9f20c85e220651590552b94e92da0743d02f5a97446b1e2f51f5781e244ecb`. The archive and installed tree each contain 1,806 files, with inventory SHA-256 `c2a663561c43039cb0b349ef4f3877151c68e0fc2d3714bf5b78d83e70d7c708`.

Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 each matched all 68 default and reference outcomes and reflection traces. Each default route made 30 valid Rust/WASM calls, zero refusal calls, and zero unattributed calls. Each reference route made zero Rust calls. Chromium requested the installed WASM asset, used no Node globals, and made no external requests. The receipt records positive exact-tree binding plus negative controls rejecting a manifest-mismatched archive payload, a mutated extracted file, and an extra executable.

Replay command from the repository root, after extracting the pinned archive under `/private/tmp/umf-security-ef9f20c8/package`:

```sh
UMF_EXPECTED_SECURITY_ARCHIVE_SHA256=3302afe1837647344b6fa08606f31cc61a88637d3897f15feb6cb218c01c4046 \
  bun scripts/rust-migration/r8/security-and-or-installed-replay.mjs \
  /private/tmp/umf-security-ef9f20c8/package \
  .cache/sdk-distribution/cohorts/ef9f20c8/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay/predecessor.json \
  /private/tmp/umf-security-ef9f20c8/security-replay.json
```

This is a bounded private macOS arm64 installed cohort. It does not qualify Linux x64, complete CONTRACT-062 acceptance, all default routes, or a release. The 922 logical executable retirement gaps remain open.
