# PR48 / D5 artifact integration disposition

SOURCE integration disposition accepted, subject to the precise artifact-path separation below. Reviewed only the single upload conflict and preservation of accepted D5 text; no runtime/import/AST/YAML parsing/tests or Git mutation.

Current natural concatenation workflow SHA: `944efd014566cf8dbf5df3153de39692f49523db1ca13d5bcbaed793637322db`. Read-only comparison against accepted D5 commit `d8101338b` confirms its entire initialization/replay/finalization block is byte-identical, and its separate success-only SDK release-wheel upload remains intact. Restored original full-cohort wheelhouse/release-input paths are present. No reviewed replay behavior was lost in the merge.

Keep three uploads in the existing native job:

1. Preserve `g02-native-postgresql-${github.sha}` with its original native reports/lock/template/mirror plus restored actual18 wheel binaries and release inputs. Do not claim this whole artifact is capped at16MiB.
2. Move only `${runner.temp}/g02-d5-${run_id}-${run_attempt}/upload/**` to a distinct `g02-d5-independent-${github.sha}` upload. Use `always() && github.event_name == 'pull_request' && github.head_ref == 'codex/mig-g02-typed-backfills'`, `if-no-files-found: error` and a one-minute upload step timeout. The existing fresh finalizer/seed controls cap this D5 family at16MiB and preserve failure-only evidence; no wheelhouse glob belongs here.
3. Keep the accepted success-only exact Access/Codegen release-payload artifact unchanged, with its separate2MiB assembly bound and D5/source/custody receipt.

This moves already authorized bytes between artifact families in the same job; it creates no new job, case, native authority, retry or campaign and changes no replay cap. Preserve the original shared-artifact report paths and both reviewed workflow additions. Refresh actual combined workflow/guide/source pins after the exact routing edit. Upload action network time is not retroactively claimed as replay-work duration.

Artifact routing uses only `uses/with/if` metadata, so it introduces no R3 run-string activation change by itself. The already required canonical generation from the genuinely reconciled source remains necessary and must follow the final combined source/pin freeze. Prior selected/native/D5 source receipts remain historical or source-only at their recorded identities until original real gates execute.
