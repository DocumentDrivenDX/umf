---
ddx:
  id: umf.evidence.rust-migration.r8-core-cardinality-installed
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
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-next-route-queue
      kind: extends
    - id: umf.evidence.rust-migration.r5-cardinality
      kind: references
    - id: umf.evidence.rust-migration.r5-cardinality-default-route
      kind: references
---

# R8 Core Cardinality installed-route evidence

This packet contains the three-operation Node/Bun/Chromium replay for the
source-selected default family: `inspectCoreCardinality`,
`declareCoreCardinality`, and `verifyCoreCardinalityDeclaration`. The replay
is bounded route evidence for the pinned private archive, not complete parity
or release qualification.

The harness is
[`core-cardinality-installed.mjs`](../../../../../../scripts/rust-migration/r8/core-cardinality-installed.mjs).
It requires Bun as orchestrator, Node, Chromium through the installed Playwright
package, the private `.tgz`, and its exact source-closure SHA-256:

```sh
bun scripts/rust-migration/r8/core-cardinality-installed.mjs \
  /path/to/final-fixed-point-umf-sdk.tgz \
  <expected-source-closure-sha256> \
  docs/helix/04-build/evidence/rust-migration/r8-core-cardinality-installed/final-archive-node-bun-chromium.json
```

Before replay it rejects unsafe tar member paths; verifies the private archive
profile, fixed-point source/captured-live closure, supplied closure pin, package
entrypoints, and every member hash in `manifest.json`; and pins the captured
TypeScript predecessor fixture SHA-256 to
`6d18efe22f1eb525844cb78ae5cc7854ec78ce1aa103d3fdc2eb65b274c5aeea`.
The fixture is
[`frozen-cardinality-typescript.json`](../r5-model-bindings/frozen-cardinality-typescript.json).

The Node and Bun probes import `@umf/core` (the archive's default route) and
`@umf/core/reference` (the TypeScript predecessor). They compare full captured
success/refusal envelopes for all three operations, including unknown labels,
unknown overwrite, invalid request diagnostics, malformed receipts, missing identity, invalid source diagnostics, surrogate
strings, and successful verification. They replay the frozen host-admission corpus for hidden and symbol
properties, custom prototypes, sparse arrays, cycles, NaN/infinity, undefined,
BigInt, nested paths, identity/request shape controls, and receipt-before-current
ordering. Source-before-identity and invalid-request-before-source ordering are
compared to frozen exact outcomes; accessor invocation counts are retained.

The harness additionally records and compares Proxy trap sequences between the
installed and reference routes, verifies exact caller-thrown identity for a
Proxy error carrying spoofed `UmfCoreError`-shaped fields without reading those
fields, and checks genuine refusal error class/name/code/message/path and receipt
copy prototypes. Chromium imports the package's browser WASM entry and the same
reference module, runs the same probes, checks for absent Node globals and a
served WASM request, and rejects any external request. Any mismatch is a
characterization result for Sol review; this harness authorizes no production
change, selector retirement, ledger adjustment, or publication.

The owning semantic scope is limited by CONTRACT-040: cardinality is authored
ideal metadata, not a claim of native container behavior. The existing
R5 default-route review records that generic Rust `toWire` admission differs
from predecessor TypeScript `copyJson` for selected host shapes. This replay can
characterize current installed compatibility but cannot qualify a Rust-owned
host-reflection seam or expand the semantic support subset.

## Later fixed-point replay — 2026-10-26

The [current raw receipt](current-archive-b2f816d7-20261026.json) passes the
three-operation installed replay on archive SHA-256
`b2f816d7f7bd3b57df1ecea536ceece4396a3625b2a641eb0991d135037de892`
and source closure
`0e6de413298318b0e8bcb03cac522872452b8c1e548f18a26f226d28967ce5c0`.
It verifies all 1,788 archive members and records Node 26.12.1, Bun 1.4.3
and Chromium 153.0.8010.12 parity for the frozen outcomes, host admission,
Proxy traces and caller-thrown identity. Chromium requested WASM and made no
external requests. This is bounded raw evidence for authored Cardinality
metadata, pending resource-authority review;
it does not retire declarations or qualify a release.
The raw receipt preserves escaped isolated surrogate test values; inspect it
with JavaScript `JSON.parse`, which is also used by the replay harness.

The [hash-pinned route gate](route-gate-current-b2f816d7.json) passes. Its
[validator](../../../../../../scripts/rust-migration/r8/core-cardinality-route-evidence.mjs)
checks the raw receipt and the separate 1,788-member archive preflight,
cross-checks the receipt's 11 listed member hashes, and recomputes the live
3,435-input source closure. The gate itself relies on the separate preflight
for archive-byte verification; it does not independently reopen the tarball.
It keeps 922 logical retirement gaps, 17 unresolved resource aliases,
`completeParity: false`, and `releaseQualified: false`.

## Current fixed-point replay — 2026-10-26

The new [combined three-host receipt](../r8-installed-route-evidence/current-61cbaf0a/raw/core-cardinality.json)
passes against archive SHA-256
`c1ecf9cea81c3767e281820a93294b85a45ab052862a9fcd8b0b493057302263` and
source closure
`61cbaf0ae7a0359e9ae49d2aa4c436727f2122e4174d84999efb20f42d2c3b01` over
3,435 inputs, with zero transforms and 1,788 verified members. Node 26.12.1,
Bun 1.4.3, and Chromium 153.0.8010.12 pass the three bounded operations,
frozen envelopes, host admission/order and Proxy traces, caller-thrown identity,
genuine error shapes, and parity. Chromium requested WASM and made zero
external requests. The [current route gate](../r8-installed-route-evidence/core-cardinality-route-gate-current-61cbaf0a.json)
reopens the receipt and preflight, checks its archive member hashes, and
recomputes all live source inputs. It relies on the separate preflight for
archive-byte verification. Native container behavior, resource authority,
complete parity, and release qualification remain outside this evidence.
