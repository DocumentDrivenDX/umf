---
ddx:
  id: umf.evidence.rust-migration.r8-compact-dataset-installed
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-next-route-queue
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
---

# R8 compact Dataset installed-route attempt

The selected operation is `validateCoreDatasetValuesCompact`. The
`verifyCoreDatasetValuesCompact` route is outside this replay. The
[installed harness](../../../../../../scripts/rust-migration/r8/compact-dataset-installed.mjs)
compares 17 frozen cases and host controls on the private SDK archive.

An attempt on 2026-10-26 used archive SHA-256
`b2f816d7f7bd3b57df1ecea536ceece4396a3625b2a641eb0991d135037de892`
(43,106,508 bytes) with Node 26.12.1 and Bun 1.4.3 available. The first
attempt failed to open its loopback server under the sandbox. A second attempt
with local loopback access emitted no checkpoint or receipt and was interrupted
after about 3.5 minutes. A separate loopback bind probe succeeded, but the
harness had no stage logging, so the stall stage remains unknown. No installed
route, host-parity, resource-control, or source-closure claim follows from
these attempts.

The harness now logs stages, bounds subprocess and browser waits, rejects
browser page errors and failed local resources promptly, and bounds cleanup.
Its semantic probe and frozen cases are unchanged. The earlier archive is a
historical source checkpoint after the subsequent captured-graph validator
edit.

The [current-archive receipt](current-archive-61cbaf0a.json) passed against
the later private fixed-point SDK archive SHA-256
`c1ecf9cea81c3767e281820a93294b85a45ab052862a9fcd8b0b493057302263`
and live source closure
`61cbaf0ae7a0359e9ae49d2aa4c436727f2122e4174d84999efb20f42d2c3b01`.
The [separate preflight](../r8-installed-route-evidence/current-61cbaf0a/preflight.json)
verified 1,788 archive payload members and 3,435 source inputs. Node
26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 passed the 17 frozen
validation cases, admission and copy isolation, spoofed thrown-object
identity without error-field reads, proxy trap sequence, structural and work
limits, and the near-threshold accepted/refused pair. The receipt SHA-256 is
`0be05e1a8b0252326231e73f7f83c618b5435be91439fb4e99f677a9de9d0c4f`.
This qualifies only `validateCoreDatasetValuesCompact` on this private
archive. `verifyCoreDatasetValuesCompact` and public release readiness remain
open.
