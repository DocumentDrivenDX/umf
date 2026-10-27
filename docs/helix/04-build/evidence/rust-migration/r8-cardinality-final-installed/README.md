---
ddx:
  id: umf.evidence.rust-migration.r8-cardinality-final-installed
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
---

# R8 final private Core Cardinality installed replay — 2026-10-27

This packet records the final private macOS arm64 SDK archive replay for the
three Core Cardinality operations: `inspectCoreCardinality`,
`declareCoreCardinality`, and `verifyCoreCardinalityDeclaration`. The copied
[installed Cardinality receipt](installed-cardinality-receipt.json) reports
`pass` on Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. Chromium loaded
the packaged WASM with zero external requests.

The tested archive is the private local SDK archive with SHA-256
`b6288048969bc163255064fe7c391fd8043b6e3bcfb6e4b0817e24aa65c62dc6` and
1,806 verified payload members. Its source/captured-live closure SHA-256 is
`b991bc20731f42efd3a73aebd922f8cea7c6927346a63e197e467cf9f1eb028f`; the
archive manifest SHA-256 is
`e8e1e781298577dcb169160a1881253fb81c8b08bbc31372c5a3632cfeecf718`.
The archive itself is private and is not included in this packet; the receipt
binds the replay to its recorded digest.

The receipt records installed-reference and frozen TypeScript-envelope parity,
host admission/order checks, compared Proxy trap traces, caller-thrown spoofed
error identity, genuine `UmfError` shape, and Node/Bun/Chromium parity. This is
one local Darwin arm64 cohort for the frozen Cardinality operation packet. It
is not macOS CI, full SDK closure, complete CONTRACT-040 acceptance, Linux
installed parity, logical ledger retirement, expanded support, or release
qualification. The ledger remains at 922 open logical default-route gaps and
zero retired.

Before retiring these three exact logical names, the governing plan still
requires a matching Linux x64 archive and installed Node/Bun/Chromium receipts
for committed source, transitive source authority for the embedded Cardinality
v4/v6 operation schemas and shared Core resources, the complete CONTRACT-040
authoring and refusal acceptance matrix, and review of the three exact ledger
rows. See the [R8 Cardinality host-input production cut](../r8-cardinality-host-default-ab4731e7/README.md)
and the [Rust migration plan](../../../rust-migration-plan.md#r8-cardinality-host-input-production-cut-and-python-resource-repair--2026-10-27)
for implementation context and remaining gates.
