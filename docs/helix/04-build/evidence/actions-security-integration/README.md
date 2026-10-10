# Combined main integration qualification

This integration joins the reviewed actions branch with main `cd4cc93769925d11b8480a0c2be4f009a4c737ac`. Qualification is in progress. Historical action certificates remain unchanged. This record does not claim shared security backend acceptance or automatic security integration with action authorization.

## Completed checks

- Typechecking and the browser library build passed.
- All 380 JSON schemas and 65 extension packages passed their audits.
- The actual PostgreSQL 17.9/Bun 1.4.2 action foundation passed 119 tests and 1,937 assertions, with zero failures. Its 1,349 recorded input hashes match the combined working source; the producer verified that those inputs stayed unchanged during execution.
- Public action Chromium checks passed with Bun parity and no external requests.
- Seven core browser probes passed, including the original core 0.8 facet inspection probe with 10 inspections, 10 authoring refusals, 20 JSON/YAML recoveries and zero getter execution.
- TableSpec, PostgreSQL, SQL Server, Avro and Parquet facet projections passed fresh native and Chromium checks. The four storage/codec composition checks also passed. Each result retains its own supported subset and refusals; this is not a universal binding claim.
- The actual beginner native tutorial passed commit, replay, no-op, postcondition discard, SQL rollback, retained native state, durable rejection replay, delivery-gap handling, native query parity and revoked replay denial.

[Completed report manifest](completed-report-manifest.json) records 25 retained reports. Every recorded input hash was checked against actual current files. Native `/work/` paths map to the repository root; no hash was rewritten to manufacture a pass.

## Traceability migration

The [retained identity patch](reviewed-identity-patch.json) records the exact 49 independently reviewed entries used to separate action, security and Delta DDL artifact identities. Existing paths remain explicit redirects; historical evidence retains its original identities. Astra Ultra reviewed the bounded identity migration before application and found no implementation/conflict-resolution blocker in the combined source.

## Remaining delivery gates

The unrestricted regression finished with 2,469 passing tests, 15 failures and 160,677 assertions across 444 files. Its exact failed output remains in `regression/unrestricted-original.log`. Five timeout failures passed unchanged complete-file serial reruns; ten strict-admission failures remain recorded qualification boundaries, not current strict passes. All eight fresh semantic checks passed with a before/after source and fixture seal, including a duplicate 409-test relationship replay. See `semantic/record.json` and `regression/timeout-retries/record.json`. Final documentation build, signature and visual checks, CI, merge, live deployment verification and release remain pending. No result here grants the upstream security backend's open acceptance criteria.
