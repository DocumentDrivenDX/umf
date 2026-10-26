# Core 0.10.2 producer evidence

The current repair batch updates the website oracle to all 24 authored Records and
adds bounded static LIMIT diagnostics through the existing attempt journal. The
original execution limits and commit assertion remain unchanged. Hosted inventory
regeneration, current-source qualification, merge and publication are pending.
The retained records below keep their historical source and scope.

## Historical source checkpoint

The current checked product-source candidate is
`2a76a8e8213ec64334408ec49edadc3b6e765cce`. Its parent
`e527340c60c68c56ace12b9e0644e93211d3f792` fixes cross-filesystem reference
staging by staging normal builds beside their destination; check mode retains
its original temporary path. The focused two-test regression passes. The fresh
inventory was actually generated at e527, then committed unchanged in 2a76.

The separate unmodified full source-inventory check at 2a76 returned zero:
578 modules and 344 active scripts, inventory SHA256
`90ecd7dc3c7461660d67aa42358d8c339534cb9618d6b68b6b8c336cb843e35c`.
The checker took 103.087 seconds; its controller completed in 168.328 seconds.
Independent read-only audit took 23.631 seconds and finished within the original
300-second aggregate budget. The controller and all 14 owned child PIDs and
process groups are absent, the worktree is absent from the filesystem and Git
registry, and all 19,517 dependency entries match fresh before/after observations.
The committed inventory input stayed byte-identical. The `*-011.json` records
retain actual receipts and provenance; the audit source is inert `.py.txt`.
The retained syntax warning is source analysis, not execution of that probe.

Independent source/inventory gate review accepted the actual check and retained
owned cleanup evidence. This check does not qualify the
website build or native Python artifacts. Hosted Linux/macOS wheel evidence at
`ebce5444dfacf4cfda9cc93f1652d43f83e59d57` keeps that exact historical source.
Fresh candidate CI, website and platform artifacts, final review, merge,
immutable publication and fresh public-download verification remain required.
No release or managed consumer acceptance is claimed.

# Historical check010 source evidence

The product-source producer at that checkpoint is `14cc001d8944cb3ed61da720c7795b8b521d496e`.
Its sole change over b4f is test import ordering and equivalent combined context
managers. Repository-config Ruff 0.17.1 reproduces I001/SIM117 on the baseline;
the corrected test passes Ruff and all three focused tests. Independent review
confirms the same assertions and context-manager ordering.

The exact inventory candidate was derived from the qualified 091 capture by
changing only that script's bytes/SHA and the aggregate source-cohort digest.
It was not claimed current until a separate unmodified full `--check` at 14cc
freshly captured the complete inventory and returned zero. The controller
completed in 96.149 seconds, including cleanup. The checked inventory is
SHA256 `66166e441062358f3f8ba73943079e7bfcca964157f6076fcc754c4c21cdffea`,
with 578 source modules and 342 active scripts. Independent source audit matches
3,624 unique recorded Git paths and 37,730,421 bytes. The actual check and source
audits, derived provenance, controller source and cleanup are the `*-010.json`
records. All 19,517 dependency entries stayed unchanged; all twelve recorded
owned PIDs/groups and the worktree path/Git registration are absent.

Previous b4 hosted Linux/macOS native artifact and inventory runs passed, while
its Python workflow failed Ruff. Those results keep their b4 scope. Fresh
successor CI, direct/sdist-rebuilt native artifacts, independent artifact review,
merge, immutable release and public-byte verification remain required. The
broader 51-body local source run remains incomplete; it is not relabeled a pass.
No release or managed consumer acceptance is claimed.

## Historical 091 source evidence

The source producer at that checkpoint is `091aea5d111045fe70b229bc72fb47ef95febb9d`.
It fixes explicit distribution-version verification for 0.10.2 while preserving
the historical verifier default and semantic document version 0.10.0. The new
three-test version control suite passed independently; its source and exact
commit reviews are retained in the `verifier-version-*-009.json` records.

The unmodified R3 generator completed at that source and produced the committed
inventory: 578 source modules and 342 active scripts. A separate unmodified
`--check` freshly captured the complete source and matched its exact serialized
bytes, exiting zero in a 427.137-second controller run. The generated inventory
is SHA256 `a2609b45cd6131aae1211a764405912472f4ccdd998d021807d65948b53f939b`.
Generation, check and independent cleanup receipts are the `r3-*-009.json` files.
Both runs preserved the complete 19,517-entry dependency snapshot and removed
their owned processes/worktrees. The syntax warning in the retained check log
is not native execution of the referenced probe.

Independent source audit matched 3,624 unique recorded Git paths and 37,730,376
bytes, reconstructed the cohort digest, and verified the expected activation,
test and verifier delta. Its two preceding temporary audit-helper attempts
failed on ordering and pytest-label assumptions; only the corrected final
audit completed (session 89125, exit zero). No product source was changed by
those helper corrections.

The broader 51-test source run printed passing test bodies but required
SIGTERM at its bound; it is retained as incomplete, never a terminal pass.
Prior producer/native failures and earlier evidence retain their original
scope. These source records do not qualify new native wheels. Current-source
hosted checks, both platforms' direct and sdist-rebuilt native wheels, independent
artifact audit, merge, immutable publication and public-byte verification remain
required. No release or managed consumer acceptance is claimed.

## Historical source evidence

This candidate preserves semantic Core 0.10.0 and advances the Python distribution
to 0.10.2 so the extension-kind changes on main can be published without replacing
0.10.1 assets. The source producer is isolated from G02 migration feature changes.

At source commit `5db979425070dd01836bf7304dfca29003945673`, the unmodified R3
checker freshly captured the complete inventory and returned zero after exact
canonical-text comparison with the disclosed derived candidate: 578 source
modules and 341 active scripts. The pinned tools, unchanged dependency snapshots,
candidate provenance and successful owned-worktree cleanup are recorded in
[r3-check-008.json](r3-check-008.json). The seed was not claimed to be generated or
qualified before that actual check. [Prior attempts](prior-attempts.json) remain
failed, including the earlier generation success followed by check timeout.

[Source artifact tests](source-artifact-tests.json) record 48 passing synthetic
source-only tests. [Workflow review](workflow-qualification-review.json) binds the
addition of the existing extension-kind suite to both direct and sdist-rebuilt
isolated native-artifact invocations. These records do not prove either native
artifact passed its matrix.

Hosted current-source checks, native direct and sdist-rebuilt artifacts on both
declared platforms, independent artifact audit, merge, immutable publication and
fresh public-download verification remain required. No release or managed
consumer acceptance is claimed here.
