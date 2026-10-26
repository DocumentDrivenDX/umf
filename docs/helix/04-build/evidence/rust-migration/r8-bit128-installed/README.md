---
ddx:
  id: umf.evidence.rust-migration.r8-bit128-installed
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-076
      kind: evidence_for
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-bit128-default-adapter
      kind: predecessor
---

# R8 installed Bit128/UUID default-route evidence

The source-selected package root in the final private archive passed the
frozen `umf-128/1` predecessor packet for all eleven public functions:
`parseBits128`, `parseUuid`, `bits128FromBytes`, `bits128ToBytes`,
`uuidFromBits128`, `uuidToBits128`, `compareBits128`, `bits128ToWords`,
`bits128FromWords`, `bits128ToInteger`, and `bits128FromInteger`. The packet
is `scripts/rust-migration/r5/bit128-default-route/predecessor.json`, SHA-256
`05fdc7e6fdd26e9065ac5daa52672d37ebe27a470f1e4cdf140e6563171712e6`.

The tested archive is
`/private/tmp/umf-r8-provenance-final-20261025/umf-sdk.tgz`, SHA-256
`591e5e5e3e919d2a613ed90f31dd1faf50e158f2666d6c613e21b3dc35d41711`. Its
1,787 manifested package members passed hash checks. The 3,431-input source
closure is fixed-point with zero generated-input transforms; each captured
source input matches this checkout and the recomputed source tree SHA-256 is
`65a6458ad8950da0669fa713d736d1b81e576793d0f6c12896ccf59027ed941d`.
[Archive preflight](archive-preflight-20261025.json) records the selected
production source and package-member hashes.

All eleven frozen outcomes matched in Bun 1.4.3, Node 26.12.1, and real
Chromium 153.0.8010.12. Forged `AdmissionError` and `UmfCoreError` objects
thrown by caller-controlled Proxy traps retained strict object identity in all
three hosts, with zero property reads. Genuine Bit128 engine and accessor
admission errors mapped to public `UmfError` with the observed exact envelopes:
`BIT128_TYPE`, empty path, and respectively `Expected hexadecimal text` or
`Word accessors are forbidden`. Offset `Uint8Array` input was snapshotted;
mutating returned bytes did not mutate the represented value; `Uint8Array`
subclasses were accepted. Node and Bun accepted and copied `Buffer` input;
Chromium has no `Buffer` global and reports that carrier as unavailable.

Receipts and replay harnesses:

- [Bun receipt](bun-20261025.json) and [Node receipt](node-20261025.json), produced by [the host replay harness](bit128-installed-replay.mjs).
- [Chromium receipt](chromium-20261025.json), produced by [the browser replay harness](bit128-installed-browser.mjs).

This evidence covers these eleven operations in the recorded runtimes and
host environment only. It does not qualify the complete SDK, other operating
systems or architectures, the `./reference` entry, Python bindings, broader
UUID interoperability, or release publication. The archive manifest continues
to mark this package as private route qualification, not publishable.
