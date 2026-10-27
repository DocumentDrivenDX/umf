---
ddx:
  id: umf.evidence.rust-migration.r8-installed-compact-security-pre-arrow-pointer-20261027
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
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-compact-dataset-verify-source
      kind: informed_by
---

# Historical installed Compact and Security replay

This local macOS arm64 packet is pinned to a private, nonpublishable SDK
archive made before the Arrow diagnostic JSON Pointer correction. The archive
SHA-256 is `8ecb5c01fff520a8f253ca2fd6b7dc4cae079f5b5a9f5ce7cf3d5052585618ea`;
its [package manifest](sdk-package-manifest.json) SHA-256 is
`66a7470bce9dfa48a324b7aed7c0567537ff680a498a7c0302d637672e811f37`.
The [package receipt](sdk-package-receipt.json) records a fixed-point,
zero-transform source closure
`47e531b490c202e6c19137d892e7776e445461ab69b9c8a79d99532d8faa02d5`.
The archive is retained locally at `.cache/sdk-distribution/umf-sdk.tgz` until
the corrected-source build replaces it; its bytes are not checked in.

The [Compact installed receipt](compact-installed.json), SHA-256
`ebc252a61fc8d09659d11f510b5ef60ad277ec58a1a2617ca4412fa89be46178`,
passed five frozen cases on Node v26.12.1, Bun 1.4.3 and real Chromium
153.0.8010.12. Each default case made two native/WASM calls and its reference
case made zero. The [Security installed receipt](security-installed.json),
SHA-256 `20b4bb57c477cbbffd11964c6032867c1b6ef4ed81ee65ad9c5b77c9c6af08ae`,
passed 68 cases on each host with 30 valid Rust/WASM calls, zero refusal calls,
and zero reference calls. Chromium loaded the archive's WASM and made no
external requests. Both receipts verified the archive's member inventory.

The subsequent Arrow source edit changed the live source closure. A Cardinality
archive capture correctly refused that mismatch before emitting a receipt.
This packet is historical, bounded installed behavior for the exact archive;
it does not prove the current source, whole SDK parity, gap retirement, or
release qualification. No macOS CI was run.
