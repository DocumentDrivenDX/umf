# Core 0.10.2 producer evidence

The current source producer is `091aea5d111045fe70b229bc72fb47ef95febb9d`.
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
