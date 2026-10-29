# PR48 Python correction source review

SOURCE ACCEPT for the frozen19-path Python-only batch against source71b5f87805324c0e0d12c279a4898c8a44f625a9. Reviewed actual complete affected diff and exact source-freeze files; no candidate runtime, imports, AST, Ruff/tests, source edits or Git mutations performed. Actual Ruff0.17.1 and original Python/Codegen gates remain required; this receipt does not assert103 diagnostics have passed or qualify later source.

Frozen roster: docs/helix/04-build/evidence/schema-migration-design-review/main-reconciliation-001/pr48-actual-ci-failures-40393370049/python-source-freeze001.json SHA f886d35b07b2bb3f6e0df8c31531355a8c20359ff16393a144e3052913d0b968. All19 actual file byte counts and hashes match.

The ledger removal is only its unused duplicate private _validate_intent plus unused threading import. The actual generation_enrollment_authority._validate_intent remains unchanged and is still called by authority request creation; its exact GenerationEnrollmentAuthorityContext guard, closed fields, cohort/principal/digest checks remain active. No reverse import/circular dependency or annotation/guard weakening was introduced.

Production deltas otherwise preserve the behavior under review: ordered imports/exports, identical __slots__ names, precise context-manager exception annotations with TracebackType, equivalent combined readonly-or-reservation startup timeout branch and merged observation predicate. Calls with unused results still execute. Timeout restoration continues to catch BaseException and quarantine uncertain I/O; cleanup exceptions still preserve/redact the original refusal. The line-specific S110/BLE001 annotations explain those existing fail-closed semantics; no global Ruff configuration/version/rule waiver changed.

Tests preserve mutation setup before the expected-refusal scopes. The narrow SIM117 annotations keep mutations and an initial successful validation outside the assertion that follows. Other with-statement flattening preserves entry/exit order, operations and assertions. B023 fixes bind each iteration’s actual caller, original asyncio.to_thread and probe in local default arguments; both original read/write input-snapshot controls and post-capture assertions remain. SQL string adjacency is parenthesized into the same one string, not split into extra list elements. Original pending/restart journal/lease and uncertainty controls remain, including genuine control leases; no native authority was fabricated.

The aggregate missing-wheel test still physically deletes a wheel. It explicitly selects a real Core wheel and expects the actual early complete-verifier diagnostic “Child Core wheel is not a regular file in its exact wheelhouse”; production aggregate code and all other mutation/isolation tests are unchanged. This is a located oracle correction, not broad toThrow/regex relaxation.

No new source blocker was found in this finite batch. Root may commit these exact source bytes and integrate the separately corrected B/C+D5 batch, refresh only authorized current source pins, genuinely regenerate/adopt affected resources and run all original gates with unchanged cases/caps/tool versions. The earlier portable timeout remains an unresolved timing observation, not a proven product regression or authorization to change deadlines; assess it in the already necessary changed-source qualification. Current selected-native Q71 acceptance stays historical for that source; D5/current release remains open.

## Exact postimages

- python/umf_access/src/umf_access/lifecycle/__init__.py c2f65a01de67ff46640bdf9d70737a7d3860233137ff464bcc393a0cc172f683
- python/umf_access/src/umf_access/lifecycle/generation_enrollment_ledger.py 22cea4a28baf39d97a989c5731563b2107d2db0ada122f01ed4d5b3cab5b30cd
- python/umf_access/src/umf_access/lifecycle/host.py 41b72fda9055ee131c5ef1c7236594e53995386864cb099019d534103f504929
- python/umf_access/src/umf_access/lifecycle/ingress_custody.py 193a43348c3e35721d02170f4b0ab8b7a024294b4c73b176b8873d303a5131e0
- python/umf_access/src/umf_access/lifecycle/ingress_local_postgres.py 7a718ad57c276e4e18698c497a50ebe4f76e3203eddc0f3dba857b0a047d3949
- python/umf_access/src/umf_access/lifecycle/owner_bootstrap.py d4b09e70a0b0d571c6cbf9c834ff95aeab3b697d2a6e8453c7c8ea1f99db4f0e
- python/umf_access/src/umf_access/lifecycle/row_originals.py 2cb77ffa1b60c5525b8f58807b8ba8de9813d9ce63a2499b2a4680b45000acad
- python/umf_access/tests/test_fixed_query_preparation.py 77dde4035b7506abfcb97ecb2dbf013b463fdb735b06851353febf048e3b8f21
- python/umf_access/tests/test_g03_host.py d5828c5c4e103cc9251efa0d8717f8464b642eb239c9a8daabb71fa77a6f2f38
- python/umf_access/tests/test_ingress_local_postgres.py 352d5a57b4db450a1b3e25380bef5a0bd90b4eb7eace6005b70b4504abcf03b5
- python/umf_access/tests/test_migration_phases.py 32a403e5edc8cf0ff03311a37966cf928fdd73f3b75b85a322985f11b74896dc
- python/umf_access/tests/test_native_sessions.py 27029d478b52590906bb548da00b9eefe69f1fc8a88df2c095046563b13d0de2
- python/umf_access/tests/test_operation_input_snapshot.py 16c5e8fc5b72e04a8ac23edb2016f92235fd560a6db2015a05daeac3085195ae
- python/umf_access/tests/test_original_store_pending_restart.py 222fab9ebb020ed6994ee2f2df8cdfa63c7dc58e1bb95ae25842cab7deaf5b20
- python/umf_access/tests/test_row_originals_creation.py 4c84f7ac7a757871dbaae688118aa0297a54feb4f311f621a45d5f2e70a887cf
- python/umf_access/tests/test_row_originals_profile.py 696560344796a229c9099c9b0ac4327dfd41452429b5e5103426c64bf38cc087
- python/umf_access/tests/test_table_outcomes.py 99cba3eb97ddd67f0ce06ec94ca67f845dc68995c4a81a7293d4c421770cfc47
- python/umf_codegen/tests/test_migration_discovery_selector.py 344d650466d4fe98e0d97c31fbcebe4af091743ac5d9c1571dd90d502e34ee82
- tests/codegen/test_aggregate_cohort.py 0bb9aa41d832ba462845dceed0b2bc1e37fb7486a6407e047dfecd6b1f7e0d49
