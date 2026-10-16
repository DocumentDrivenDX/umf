# SDK current-main reconciliation for release preparation

Parent source67b48116 is reconciled with main d40988e7, retaining newer engine targets/catalogs and owner behavior together with reviewed exact source/cohort/selected-Key, raw codec, command identity and continuation guards. Independent Astra source review is clear:130 source-runtime tests with fresh generated fixtures, vector refusal/import controls, AST, Ruff0.17.1 and boundary checks pass.65 Python file hashes are retained.

Parent final source-inventoried installed-wheel checks pass116 tests on each Python3.11.17/3.14.8/Pydantic2.14.1. All3 checkers pass generated positives and32 negative cases each.932 Bun tests/3294 assertions across24 disjoint files pass on exact npm Bun1.4.2. Actual installed Weft/PostgreSQL18.6 read/catalog/source/Key32 controls pass without skips, and owned native action/bulk and exact pgvector0.8.7 search fixtures pass; all owned clusters stopped.

These are exact-source, scoped local checks. They do not freshly qualify Truss/Ashlar adoption, the managed services, temporal behavior or frozen browser cohorts. Prior receipts keep their original pins. Final combined reference/signatures/hostedCI/deployment/release remain pending; signing timed out waiting for1Password.

Wheel SHA-256: `c2c3794d89277d644ca1198ff63fd076faec059046b6412823dfafda7070b392`.
