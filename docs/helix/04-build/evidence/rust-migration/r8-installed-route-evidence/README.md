---
ddx:
  id: umf.evidence.rust-migration.r8-installed-route-evidence
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# R8 installed default-route evidence gate

This gate records bounded R8 installed-route evidence. It is not a retirement
review, complete-parity claim, or release qualification. The `0e6de413`
aggregate passed for 24 selected operations on its fixed-point source cut;
the subsequent captured-graph validator edit makes it a historical cohort.
The later `61cbaf0a` cohort is recorded below. All 922 logical executable
retirement gaps remain open.

The [current archive preflight](current-0e6de413/preflight.json) verified all
1,788 packaged members and recomputed the 3,435-input live source closure.
The archive SHA-256 is `b2f816d7f7bd3b57df1ecea536ceece4396a3625b2a641eb0991d135037de892`;
the source-closure SHA-256 is `0e6de413298318b0e8bcb03cac522872452b8c1e548f18a26f226d28967ce5c0`.
The [adapter input](current-0e6de413/adapter-input.json) pins each raw receipt,
the [aggregate](current-0e6de413/aggregate.json) pins normalized host claims,
and the [gate result](current-0e6de413/gate-result.json) records the accepted
24-operation scope. The gate reopens the hashed receipt and source evidence;
the separate preflight is the step that reopened the archive bytes.

The [2026-10-26 prior cohort](current-61cbaf0a/preflight.json) passed
for private archive SHA-256
`c1ecf9cea81c3767e281820a93294b85a45ab052862a9fcd8b0b493057302263`
and source closure
`61cbaf0ae7a0359e9ae49d2aa4c436727f2122e4174d84999efb20f42d2c3b01`.
It verified 1,788 package payload members, 3,435 live source inputs, and
zero generated transforms. The [prior-cohort adapter input](current-61cbaf0a/adapter-input.json),
[aggregate](current-61cbaf0a/aggregate.json), and
[gate result](current-61cbaf0a/gate-result.json) bind fresh Node 26.12.1,
Bun 1.4.3, and Chromium 153.0.8010.12 receipts for the five required
families. The aggregate independently reopens those raw receipts and
recomputes the current source closure; it passes for the same **24 bounded
operations** while retaining all **922 retirement gaps**. The Bit128 Node/Bun
receipts include a process-bound observation of the archive-adjacent native
addon. The Core Keys current replay does not repeat the historical 700,000-unit
retained-value control. The Core Inspectors current harness accepts a caller
supplied expected closure and explicit local port; the direct checked-in
harness receipt is used, rather than the preliminary temporary-copy probe.
This remains a private evidence cohort, not full parity or release approval.
Later Rust source changes and a post-replay whitespace correction mean this
cohort is now historical relative to the moving worktree. Re-run the archive
preflight, aggregate gate and host replays only on a new fixed-point cut.

## Current fixed-point archive cohort (2026-10-26)

The [current cohort record](current-a2552db0/README.md) documents the rebuilt
archive, independent member-hash preflight, current-source closure, host
receipts, aggregate and gate. The archive SHA-256 is
`6adacc2f019d6cf73c856c9002ba75fb1d33ca22cb56182e63806296983661e`; its
manifest SHA-256 is
`c86c84bc6468f51495be1664d9c2bda53e3e5732ad8d6e2f25019bfc61e9acad`.
The fixed-point source closure is
`6a6bef1345e9f90e0d26dd8841ed27ba2ca6f3db8e6dfd330fb78dd9f42cb14c` across
3,439 inputs with zero generated transforms. Independent preflight verified
1,788 of 1,788 package payload members. Fresh Node 26.12.1, Bun 1.4.3 and
Chromium 153.0.8010.12 receipts pass for CSV Boolean (2), Core Inspectors (3),
Core Relationships (4), Bit128/UUID (11), and Core Keys (4): 24 bounded
operations total. The gate independently reopens pinned receipts and checks
the live source closure; archive bytes are verified by the separate preflight.
All 922 logical retirement gaps remain open. This private cohort omits the
historical Core Keys 700,000-unit retained-value control and does not establish
complete parity, declaration retirement, or release qualification.

## Required archive and receipt binding

The aggregate validator is
[`scripts/rust-migration/r8/installed-route-evidence.mjs`](../../../../../../scripts/rust-migration/r8/installed-route-evidence.mjs).
Run it against a completed aggregate manifest with:

```sh
bun scripts/rust-migration/r8/installed-route-evidence.mjs <aggregate.json>
```

The manifest must pin the archive SHA-256 and source-closure SHA-256, identify
a positive source-input count with zero generated transforms, and point to a
hashed passing archive preflight. The preflight must pin a member-hash map and
attest equal archive/verified member counts. This aggregate validator checks
those hash-pinned attestations but does **not** reopen the SDK archive or
independently hash its members; the output names this evidence-only limit.
Separately, the gate reads the hash-pinned SDK source manifest, checks each
listed source file against the current checkout, and recomputes the source-tree
closure using the package builder's path/content digest order. Its input count
is derived from the pinned manifest and must match the aggregate.
Each of the five families must carry exactly three hashed receipts (Node, Bun,
Chromium), each explicitly bound to that same archive and closure. Receipt
content that independently names a different archive or closure is rejected.
Every normalized host receipt must declare
`currentSourceStatus: "current-source"`, derived by reopening its hashed raw
receipt against the current preflight. An explicit historical status in a raw
receipt fails closed; raw receipts that predate this field require exact
archive-member or source-closure binding before normalization.
The required family and operation inventory is fixed in the validator; missing
families, duplicate/missing runtimes, changed operation sets, bad receipt
hashes, failed receipts, or mixed archive cohorts fail closed.

The gate admits 24 selected logical operations after all five families pass.
It always reports `logicalRetirementGaps: 922`; bounded route proof does not
retire declarations. `verifyCoreKeyOperation`, four Core Facets operations,
three Core Cardinality operations, and two compact Dataset operations are
explicitly outside the manifest's accepted family set.

## Receipt matrix

| Family | Operations | Required installed evidence | Controls represented by its harness |
|---|---:|---|---|
| CSV Boolean | 2 | `scripts/rust-migration/r8/csv-boolean-default-route-installed.mjs`; R8 adversarial replay supplement | Frozen packet; Node, Bun and Chromium route checks; adversarial host/native-addon behavior |
| Core inspectors | 3 | `scripts/rust-migration/r8/core-inspectors-current-installed.mjs`; source-current host-shape probes | 26 frozen cases; Node, Bun and Chromium; damaged-addon and selected host-error controls. Recorded TypeScript-reference host-shape differences remain visible and are not erased by route qualification. |
| Core Relationships | 4 | `scripts/rust-migration/r8/relationships-default-route-parity.ts` and `relationships-default-browser.mjs` | 11 frozen cases; Node, Bun and Chromium; predecessor admission order and host outcomes |
| Bit128/UUID | 11 | `r8-bit128-installed/bit128-installed-replay.mjs` and `bit128-installed-browser.mjs` | Frozen 11-function packet; Node, Bun and Chromium; forged-error identity, byte-carrier copies and UUID/Bit128 results |
| Core Keys | 4 | `scripts/rust-migration/r8/core-keys-default-installed-current.mjs` | Four operation baselines; Node, Bun and Chromium; root/reference parity, output shape, selected admission-order sentinels. This harness does not repeat the prior 14-case host matrix or 700,000-unit retained-value check. |

The aggregate is valid only while the current checkout matches the same
post-correction fixed-point archive. Historical receipts with older archive or
closure hashes document prior work but cannot satisfy this gate. The
`61cbaf0a` ledger reports 24 bounded proven routes alongside 922 retirement
gaps, 860 unmapped executable names after the separate Schema Properties
mapping update, and 17 unresolved resource aliases. Its gap count is not
changed by the bounded installed replays.

## Validation

The fail-closed unit suite is
[`scripts/rust-migration/r8/installed-route-evidence.test.mjs`](../../../../../../scripts/rust-migration/r8/installed-route-evidence.test.mjs).
It covers complete-family acceptance, missing receipts, receipt hash drift,
archive/closure cohort mismatch, missing or contradictory receipt claims,
historical/ambiguous source status, forged preflight self-assertion, current
source drift, pending-route exclusion, and preservation of all 922 retirement
gaps. Its archive scope is evidence-only: verifying archived bytes remains the
responsibility of the separately recorded archive-preflight execution.
