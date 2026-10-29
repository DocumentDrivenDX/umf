# Public-H native storage preparation provenance (staging)

This directory is a metadata-only provenance bundle for the proposed native-volume storage route. It is staging for review and adoption; it is not an H execution, qualification, or source change. Source Docker volume `umf-migration-source-267675510` and all repository checkouts were left untouched by this bundle operation.

## Diagnostic findings

The first diagnostic wrapper launch failed with a Python `SyntaxError` before Docker started. That event is represented as a transparent observation because its transient tool output was not saved as a standalone file. The corrected wrapper then ran diagnostic attempt 001 with the source volume mounted read-only at `/volume-producer` but without Git's `safe.directory` setting. Git returned 128 for that mount. The result did **not** establish that the volume lacked a worktree; the earlier interpretation as a missing worktree was incorrect.

Diagnostic attempt 002 repeated only against the source volume, read-only, with `git -c safe.directory=/volume-producer` on each command and bounded stderr text retained. It established that the volume is a valid clean worktree at `/volume-producer`: HEAD `e4299aff8e87e9d211f9d86df2f2013ab9c95945`, tree `8b98c0d895983ba2b7637dd3aea567dab0943883`, and `git status --porcelain` exited 0 with zero bytes in 0.689 seconds. Its `origin` points to local absolute path `/Users/erik/.codex/worktrees/eb69/umf`. Before root's preparation, commit `dce9b430422242edd135e69a7a64620d0244784e` (M) and tag `umf-v0.5.7` were absent. Attempt 002 ran in 2.244 seconds; its owned container was absent afterward.

The separate host-clone diagnostic in attempt 001 verified P/tree, public GitHub origin, M, tag, and ancestry, but host-clone `git status --porcelain` timed out at 30 seconds. It did not establish that clone's cleanliness. Do not conflate that result with attempt 002's volume clean status.

## Root metadata-only preparation

The copied root receipt records a Git-metadata-only preparation on the existing qualified source volume: it changed `origin` from the local worktree path to `https://github.com/DocumentDrivenDX/umf.git`, fetched M and `umf-v0.5.7`, and confirmed unchanged P/tree, clean status before and after, P ancestor of M, and tag resolving to M. The reported duration was 3.649 seconds. The preparation receipt and command record are copied verbatim; this staging operation did not repeat them. Root reported its preparation container absent from the reachable engine; that report is not represented as an independently captured cleanup record here.

## Scope and limits

The included Sol plans describe the approved read-only Git trust configuration and native-volume/evidence-storage route. No H command, archive, candidate execution, Docker storage operator, or public-H qualification was run for this bundle. It adds no new source bytes and does not assert that a future operator is source-accepted or READY. The previous public-H failures remain preserved separately. Root remains the sole Git-volume mutator.
