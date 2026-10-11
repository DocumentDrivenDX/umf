# Astra review — pg-raw observation validation

Disposition: no blocker for this narrow host-side evidence integrity change. Read-only source review; no native probe, Docker command, gate execution or source edit was performed.

Independently executed `python3 -B -m unittest discover -s tests/security/native -p test_pg_raw_observations.py -v` from the UMF integration checkout. Exit 0: all six tests pass. The test module AST-extracts the three actual runner functions, so importing the test does not initialize the native fixture.

The recursive comparison rejects bool/int, int/float, string/number and null/bool substitutions at nested positions. Object member order remains irrelevant, while array order is preserved. Each assertion is serialized with allow_nan=False and independently decoded before comparison and retention, removing aliases to both input trees. Failed comparisons are not appended. Final publication snapshots the whole list, including the separately assembled primary case assertion, then rejects invalid/duplicate assertion IDs and any mismatched expected/observed record. This occurs before constructing the passing receipt; existing source-drift and owned-fixture cleanup checks remain afterward. The retained objects are not subsequently mutated by the publication path reviewed.

The six controls cover nested scalar carrier mismatches, mutation of both original trees, corruption of a retained record detected by final validation, duplicate IDs, unordered objects versus ordered arrays, and nonfinite rejection. These are host controls only, not a fresh qualification of any registered native case. JSON normalization here does not prove original numeric-token/byte identity or authenticate a producer or receipt.

B12 scope is appropriately unchanged: `pg-raw.B12` in cases.json remains required/not-run with null command, evidence, testSource and oracleSource, and no implementationSources. The runner's explicit case list still excludes B12. This fix does not establish its complete engine/build/model/policy/mapping/source/actual-role custody obligation, nor promote backend acceptance. No registration or native assertion was relaxed.

Reviewed source hashes:

- `tests/security/native/pg-raw-membership.py`: `3b1e51ba864168dc3a697f0b7bfd736363e6e04499fb9ff69d2dc42924f301e4`
- `tests/security/native/test_pg_raw_observations.py`: `6ea020af7ca6d044bf92ee8e233d55b4705b695b34fb9a20fe8aebb1bf53d63d`

Reviewer interpreter: `3.9.6 (default, Aug 25 2026, 21:26:21)  [Clang 21.0.0 (clang-2100.3.34.2)]`. `git diff --check` passed.
