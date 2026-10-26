---
ddx:
  id: umf.evidence.rust-migration.r8-installed-route-evidence.current-a2552db0
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
    - id: umf.evidence.rust-migration.r8-installed-route-evidence
      kind: continues
---

# R8 installed archive cohort: a2552db0

This private evidence cohort rebuilds the installed SDK archive from the frozen
source closure captured at commit `a2552db04c3553ce852f017eaee029f4574b323a`.
The pinned Rust toolchain was 1.90.0 and the pinned `wasm-bindgen` binaries
were 0.2.100. The canonical build reports `sourceTransformStatus: fixed-point`,
`sourceTransformCount: 0`, and identical live and captured source hashes:
`6a6bef1345e9f90e0d26dd8841ed27ba2ca6f3db8e6dfd330fb78dd9f42cb14c` across
3,439 inputs.

The archive SHA-256 is
`6adacc2f019d6cf73c856c9002ba75fb1d33ca22cb56182e63806296983661e9`; the
package manifest SHA-256 is
`c86c84bc6468f51495be1664d9c2bda53e3e5732ad8d6e2f25019bfc61e9acad`. The
independent [member-hash preflight](preflight.json) verified 1,788 of 1,788
package payload members using [member-hashes.json](member-hashes.json). The
[build receipt](build-receipt.json), [live source manifest](live-source.json),
and [preflight](preflight.json) bind the build and package evidence.

Fresh installed-route receipts cover Node 26.12.1, Bun 1.4.3, and real
Chromium 153.0.8010.12 across five fixed families: CSV Boolean (2 operations),
Core Inspectors (3), Core Relationships (4), Bit128/UUID (11), and Core Keys
(4). The [raw receipts](raw/), [adapter input](adapter-input.json), and
[normalized adapter output](adapter-output.json) feed the
[aggregate](aggregate.json) and [gate result](gate-result.json). The Bit128
Node and Bun process-bound receipts observe the archive-adjacent native addon
loaded in each process. The aggregate admits 24 bounded operations and
preserves 922 logical executable retirement gaps.

The aggregate gate reopens hash-pinned raw receipts and recomputes the current
source closure. Its archive-byte status depends on the separate member-hash
preflight; the gate itself does not independently reopen archive bytes. The
Core Keys replay does not repeat the historical 700,000-unit retained-value
control. This private cohort does not establish complete host parity, retire
declarations, or qualify a release. Schema Properties, Core Facets, Core
Cardinality, compact Dataset, and other route families are outside this
five-family aggregate and retain their separate evidence scopes.

The deterministic [R8 ledger](../../r8-symbol-inventory/gap-ledger.json) is
regenerated against this aggregate; it still reports 922 logical retirement
gaps, 860 executable names without an accepted Rust mapping, 62 accepted
opt-in mappings, and 24 bounded aggregate-proven routes.
