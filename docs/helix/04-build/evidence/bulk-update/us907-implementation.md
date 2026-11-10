# US-907 pure bulk coordination model evidence — 2026-11-08

Scope: the portable reference model in `src/extensions/actions/bulk-state.ts` (exported from `src/index.ts`) and its owner fixture `docs/helix/03-test/fixtures/bulk-update/transitions.json`. UMF base commit `b12a489844` plus uncommitted working-tree changes; no native executor is exercised or attested.

## Executed

- `bun test tests/actions-bulk-state.test.ts`: 10 pass, 0 fail, 2 todo (US-907-AC7 cross-repo formal correspondence; US-907-AC8 Chromium); the AC8 Chromium todo is covered by the separate script below. Tests were written first and failed red before the module existed.
- `python3 tests/actions-bulk-state-oracle.py`: independently coded evaluator reproduces all fixture expectations (41 transition cases, 70 exhaustive state/event pairs, 11 decision-order cases, tokens, fences) with zero errors. Three deliberately broken rules (wrong stop code, re-execute after expiry, ambiguous evidence treated as requeue) were each detected, so the oracle can fail.
- Adjacent `tests/actions-manifest.test.ts` and `tests/actions-plan.test.ts` still pass.

## Criterion status

| Criterion | State | Evidence |
| --- | --- | --- |
| US-907-AC1 – AC6 | Executed for the pure model | bun tests above; oracle agreement |
| US-907-AC7 | Executed (bounded model; fixture awaiting owner review) | The reference-model fixture covers every table row and four broken-mechanism controls. Truss `BulkUpdate.tla` now checks `PROPERTY JobRefinement` against `BulkUpdateJobTable.tla`, generated from `transitions.json` (TLC 2.19, 607,102 states, no error, matching the Python explorer); the Python refinement also passes. T8 requeue and T10 cancel-then-commit are exercised. Controls: TLC `job_refinement_restart_stopped` violates `JobRefinement`. Receipts under Truss `docs/helix/04-build/evidence/bulk-update/`. Residuals: bounded design model, not native proof; fixture expectations need owner review |
| US-907-AC8 | Executed (pure model) | Bun, the independent Python consumer and actual Chromium (153.0.8010.12, public `dist/umf.js`, `scripts/actions-bulk-state-browser.ts`, 156 cases from `tests/actions-bulk-state-corpus.ts`) agree. Chromium is compared with the in-process model; both are checked against the owner fixture only through the Bun tests and the Python oracle. Negative control: renaming `PAP_RESERVED` in the built bundle made the script fail on `r:pap1/*`; restored, it passes. Raw result: `us907-browser.json` |

## Residuals

- Fixture expectations are hand-authored from CONTRACT-904 and need owner review. Agreement between the TypeScript model and the Python oracle shows consistency with that reading, not correctness of it.
- `PAP_RESERVED` (reserved item-token key used outside the registered bulk path) is a proposed code added to CONTRACT-904 error semantics with this change; the tests assert refusal only.
- `bun run typecheck` currently fails on four unrelated errors in untracked `src/core-ideals/avro-cardinality-rust-default.ts`; none reference these files. The full `bun run test` suite and `bun run build` package inclusion were not run.
- No native custody, locking, authentication, storage or concurrency behavior is covered; those remain Truss US-046-049 qualification.

## Chromium parity run

Command: `bun scripts/actions-bulk-state-browser.ts` (needs `dist/umf.js`). `bun run build` currently exits 1 on the unrelated `avro-cardinality-rust-default.ts` type errors, but the bundle was emitted and contains the bulk-state exports. Residual: the Chromium result is parity with the in-process model, not an independent oracle; independence comes from the Python consumer.

Note (2026-11-10): the story was renumbered from the working id US-904 to US-907 because origin/main already uses US-904 for extension-defined kinds. The Chromium run above was repeated against a bundle built with `bun build src/index.ts --target=browser` because the full `bun run build` needs generated wasm packages absent in a fresh worktree; the fixture hash in `us907-browser.json` is the renumbered fixture's.

## Correction (2026-11-10): final-batch cancel

Cross-checking Truss's candidate control layout (every state reachable from the model must satisfy it) exposed that a cancel pending when the LAST batch commits produced `cancelled` with all batches committed, while Truss `BulkUpdate.tla` (TerminalPreserved) says `completed`. `advance` in `bulk-state.ts` and both Python oracle sites now give `completed` when no batch remains; the fixture gained `cancel-final-batch-commit` and `cancel-final-batch-reconcile` (written first and red against the old code); CONTRACT-904 states the rule. Results: 10 Bun tests pass, oracle 43 cases / 70 pairs / 11 decision cases with 0 errors, Chromium 158 cases. The contract wording was ambiguous, so the rule needs owner confirmation; the fixture is still hand-authored and awaiting owner review.
