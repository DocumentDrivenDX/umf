---
ddx:
  id: umf.evidence.rust-migration.r8-bounded-route-d5e1783d
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
---

# Fixed-point macOS bounded route cohort

The private macOS arm64 SDK archive at
`.cache/sdk-distribution/cohorts/d5e1783d/umf-sdk.tgz` has SHA-256
`7105a7f69118367cefe1e156481a6e3c85bad49c63157f1956f85dcef52383e2`.
Its captured and live source closure both have SHA-256
`d5e1783d7f615c8c1877df4f3d9ded43e68039f6b8f4d307e13ea79c190fa8f9`:
3,529 inputs, fixed point, and zero generated-input changes. The archive has
1,803 regular members. The archive is an ignored private build output; its
bytes must be retained separately to reproduce archive-opening checks.

[`cohort.json`](cohort.json) pins the archive, source closure, package metadata,
complete member map, platform and exact native target, and 27 raw receipts.
The [source closure](archive-source-cohort.json),
[member map](archive-members.json), and [package metadata](archive-package.json)
are preserved as separate hashed sidecars. The 27 files under `receipts/`
replay four Core Relationship, three Core Inspector, and two CSV Boolean
operations through installed default and explicit TypeScript reference routes
in Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. All frozen packet
outcomes and traces matched. Every reference case made zero Rust/WASM calls;
each default case recorded its actual calls. The CSV verification packet
distinguishes two Rust calls for a successful prepare/finish sequence, one
call before a later source refusal, and zero calls for a receipt Proxy
preflight refusal.

The package archive/tamper suite passed 9 tests. The complete
[installed SDK receipt](installed-test-receipt.json) passed on this archive
in Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 (SHA-256
`81d8bb5762335efc6aa13dda1dbc9db5a711bc6d9e20a6863e25a8f58194006d`).
It covers 31 R3 cases, the installed package-root and `./reference` export
conditions, missing and corrupt native/WASM refusals, and the existing
Cardinality, Facets, Keys, Bit128, Compact Dataset, and numeric packets.
The separately preserved [security receipt](security-and-or-installed-receipt.json)
(SHA-256 `345d82c52412668b9a3f819b3ab99f312de0414819eec017a86097297952d440`)
passed 68 frozen cases in all three hosts: 30 valid Rust/WASM calls per host,
zero refusal or reference-route Rust calls, and zero external browser requests.

This is one macOS cohort only. The hosted bounded matrix still
requires an independently built Linux x64 archive with the same source
closure and complete Node/Bun/Chromium receipts. `/2` packets establish
bounded route evidence, not full CONTRACT acceptance coverage; the ledger
retirement entrypoint rejects them. All 922 logical default-route gaps remain
open, and this bundle does not qualify a release.
