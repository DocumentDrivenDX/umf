# Core 0.10.2 producer evidence

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
