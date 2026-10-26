---
ddx:
  id: umf.evidence.rust-migration.r8-core-facets-installed
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-facets
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Core Facets installed default-route replay

This packet replays the four Core Facets public operations through the
installed Node, Bun, and browser V4 default routes and compares them with the
package's `./reference` predecessor: `inspectCoreFacets`,
`declareCoreFacets`, `verifyCoreFacetDeclaration`, and
`historicalCoreFacetPatch`. It follows the frozen TypeScript/Rust facet
packet and CONTRACT-040's scoped inspection, declaration, and historical
projection meanings. The replay also checks CONTRACT-001's JSON admission and
copy boundary: accessor refusal without getter invocation, sequential operand
admission, retained unknown facet content, detached returned values, and
exact refusal diagnostics.

[`replay-installed.mjs`](replay-installed.mjs) verifies the archive digest,
all 1,787 listed package member digests, and the fixed-point source closure
before executing the public package exports. For the current cohort it also
recomputes every archived `liveInputs` hash against the checkout. The historical
cohort pins the archive at
`/private/tmp/umf-r8-provenance-final-20261025/umf-sdk.tgz`, SHA-256
`591e5e5e3e919d2a613ed90f31dd1faf50e158f2666d6c613e21b3dc35d41711`, with
3,431 source inputs and closure SHA-256
`65a6458ad8950da0669fa713d736d1b81e576793d0f6c12896ccf59027ed941d`.
This is the historical archive cohort from before Core Key source edits; it
must not be described as source-current for the later checkout. The immutable
archive itself passed its internal live/captured closure identity and
zero-transform checks when it was built.

The frozen R5 predecessor packets remain unchanged. Their SHA-256 values are
`frozen-typescript.json`:
`c81021fbe4083e2f42f921df3213290d59520992623f5104ba782457d5fd70d5`,
`meaning-cases.json`:
`4d292db4bdd434b8033199315e420575321cdca6a486dd880bbee24ec3af01d9`,
`regression-cases.json`:
`dde541ea2965bc0df725de7d415e3f9057909cb7f32c51d3d7ad2cef60d36183`, and
`exact-errors.json`:
`5bbd7a15d5e960644c300cf6fe0d85a1ffd4f4a7c519775ee1e143794f70f279`.
The harness SHA-256 is
`e2f6bff4ef6c59b4b46b6957d78abc98d9c6c57bb3031b71a90d88cee0e9a663`.

All replayed outcomes matched both the frozen predecessor and the installed
`./reference` route. Each host passed one inspection envelope, three
declarations, one valid verification, six historical projection outcomes,
and all ten exact-error cases (invalid identity/source/record role, unknown
unit, target conflict, stale and forged receipt, invalid request, malformed
receipt, and invalid bound under unknown unit). Host-order controls showed
zero source reads before invalid request refusal and zero current-document
reads before malformed receipt refusal. Accessor getters ran zero times;
unknown nested qualifier content and its lone UTF-16 unit survived; inspection
and declaration results were detached from caller inputs. Chromium also
confirmed `process` and `Buffer` are absent.

Receipts pin this as historical evidence for Node 26.12.1, Bun 1.4.3, and
Chromium 153.0.8010.12: [Node](historical-node-20261025.json),
[Bun](historical-bun-20261025.json), and
[Chromium](historical-chromium-20261025.json). They each record the archive,
source closure, packet and harness hashes, operation outcomes, host controls,
and runtime details.

Run the historical cohort from the repository root with Bun and Playwright available:

```sh
bun docs/helix/04-build/evidence/rust-migration/r8-core-facets-installed/replay-installed.mjs \
  /private/tmp/umf-r8-provenance-final-20261025/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-core-facets-installed
```

The browser leg serves the extracted archive over an ephemeral loopback port
for Playwright. In a sandbox that blocks loopback binding, the same command
needs the authorized local-port escalation. The public facet operations expose
no `maxWork` or cancellation argument, so this packet makes no installed
default-route resource-budget claim. Cooperative zero-work `RESOURCE_LIMIT`
and cancellation behavior remains limited to the R5 opt-in binding evidence.

## Source-current fixed-point replay — 2026-10-25

The current cohort uses
`/private/tmp/umf-r8-staged-keys-20261025/umf-sdk.tgz`, SHA-256
`0b95d2d2efcc19fcbc0793fa80c3bb08810b09f031d00d81eedb92b54eeb9cb3`. Its
manifest SHA-256 is
`609cab6734711b0544983f5988f186e053a56471808e9cdb19dac28614a6ba45`; all
1,787 listed members verified. The source closure contains 3,431 inputs,
reports fixed-point status and zero transforms, and matches the expected and
captured-live SHA-256
`bfa7697725c068eeaa8c5cb3cf21efa2698484a88c297813327ed48e00ee96f6`. The
harness recomputed every archived `liveInputs` digest against this checkout
before running the hosts.

Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 again passed the frozen
operations, exact error envelopes, and host controls. The [current Node](current-node-20261025.json),
[Bun](current-bun-20261025.json), and
[Chromium](current-chromium-20261025.json) receipts pin the archive, source
closure, predecessor packets, and final harness SHA-256
`c7a47debcf1749941291c9e684c55430a9ca6cc7edfb750ab06617e638d2b210`.
Chromium confirms `process` and `Buffer` are absent.

Run the current cohort with the archive and closure pins:

```sh
bun docs/helix/04-build/evidence/rust-migration/r8-core-facets-installed/replay-installed.mjs \
  /private/tmp/umf-r8-staged-keys-20261025/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-core-facets-installed \
  0b95d2d2efcc19fcbc0793fa80c3bb08810b09f031d00d81eedb92b54eeb9cb3 \
  bfa7697725c068eeaa8c5cb3cf21efa2698484a88c297813327ed48e00ee96f6 \
  current-source-fixed-point-20261025
```

The current cohort qualifies only the four listed operations against this
fixed-point archive and recorded hosts. It does not establish broader
operating-system or architecture coverage, TypeScript retirement, a complete
SDK claim, or release authorization. The historical cohort remains preserved
as earlier evidence and is distinct from the current-source receipts.

## Current fixed-point replay — 2026-10-26

The new Node, Bun, and Chromium raw receipts are pinned under
[`current-61cbaf0a/raw`](../r8-installed-route-evidence/current-61cbaf0a/raw/)
and pass on archive SHA-256
`c1ecf9cea81c3767e281820a93294b85a45ab052862a9fcd8b0b493057302263`, with
source closure
`61cbaf0ae7a0359e9ae49d2aa4c436727f2122e4174d84999efb20f42d2c3b01` over
3,435 inputs, zero generated transforms, and all 1,788 members verified. The
[current route gate](../r8-installed-route-evidence/core-facets-route-gate-current-61cbaf0a.json)
reopens those receipts and the preflight, verifies the complete member map,
checks host outcome parity and pinned predecessor packets, and recomputes the
live source closure. The browser receipt does not record WASM selection or
external request activity, so the gate makes no claim about those controls.
Scope remains four bounded operations; resource authority, full parity, and
release qualification remain unresolved.

## Later fixed-point replay — 2026-10-26

The [Node](current-archive-node-b2f816d7-20261026.json),
[Bun](current-archive-bun-b2f816d7-20261026.json) and
[Chromium](current-archive-chromium-b2f816d7-20261026.json) raw receipts pass
the same four-operation installed replay on archive SHA-256
`b2f816d7f7bd3b57df1ecea536ceece4396a3625b2a641eb0991d135037de892`.
The 3,435-input source closure is
`0e6de413298318b0e8bcb03cac522872452b8c1e548f18a26f226d28967ce5c0`;
all 1,788 package members verified and zero generated transforms are recorded.
The [hash-pinned route gate](route-gate-current-b2f816d7.json) passes after
checking the three raw receipts, current predecessor packet bytes, the separate
archive preflight, and the live 3,435-input source closure. The gate relies on
the separate preflight for archive-byte verification; it does not reopen the
tarball. Its Chromium receipt establishes the recorded operation and host
outcomes but has no explicit WASM-request or external-request control. The
four-operation scope still needs resource-authority review. The 17 unresolved
resource aliases and 922 logical retirement gaps remain unchanged; the gate
records `completeParity: false` and `releaseQualified: false`.
The raw receipts preserve escaped isolated surrogate test values; inspect
them with JavaScript `JSON.parse`, as the replay harness does.

## Current fixed-point replay — 2026-10-26

The [current fixed-point cohort](current-facets-20261026/README.md) is the
latest installed replay for these four operations. It uses archive SHA-256
`63c72d374aff9181837ef2286dd732e52626286c9b9b199a5c12b9f3b9c331d5` and
closure SHA-256
`5804c9072e5fa85a8c50b362ae4e4f1039a1b5f91ff44b740d2eea489a8fa78f` over
3,450 live inputs, with zero transforms and all 1,789 listed member hashes
verified. Node, Bun, and Chromium passed the frozen predecessor comparisons
and the additional admission, host getter, proxy-order, and thrown-error
identity controls. The linked cohort document records host versions, artifact
hashes, and limitations.
