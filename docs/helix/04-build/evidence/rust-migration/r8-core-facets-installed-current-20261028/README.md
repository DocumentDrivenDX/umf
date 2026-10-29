---
ddx:
  id: umf.evidence.rust-migration.r8-core-facets-installed-current-20261028
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# Core Facets current-source installed replay

The [Node](node.json), [Bun](bun.json), and [Chromium](chromium.json) receipts
pass for `inspectCoreFacets`, `declareCoreFacets`,
`verifyCoreFacetDeclaration`, and `historicalCoreFacetPatch` through the
private `@umf/core` archive's default route and its explicit `./reference`
predecessor. The replay extracts the archive into a local `node_modules`
tree; it does not resolve the package's declared npm dependencies. Their
respective SHA-256 digests are
`4e3a577a57904031e761880755062bbf0ff50deca5c5613ff2dc515785fb838f`,
`032b24d3fe946e1de51751fa33adc09e7df9a5612df86e61026866a48460bdd1`,
and `24674cfb179605574ed8c4dafb0ba6fa89f1d6c83b105d8d37f3caf7764ff1f8`.
The archive and 3,744-input fixed-point source closure have the same hashes
recorded in the [Avro installed packet](../r8-avro-document-installed-current-20261028/README.md).

The replay covers the frozen R5 inspection, declaration, verification, and
six historical projections, ten exact errors, host admission and Proxy
observation controls, detached outputs, and unknown nested qualifiers. Node
26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 matched the frozen
predecessor for those cases. Chromium fetched the installed WASM, made no
external requests, and exposed no Node globals. The launcher requires exact
archive and closure pins and verifies every live and external source input
both before and after replay before promoting receipts.

The four public operations expose no resource-control parameter; the
cooperative `RESOURCE_LIMIT` evidence belongs to the separate opt-in binding
packet. This replay is bounded to the stated cases and Darwin arm64 archive.
It does not retire the four default-route declarations, prove the rest of the
SDK, or qualify a release.
