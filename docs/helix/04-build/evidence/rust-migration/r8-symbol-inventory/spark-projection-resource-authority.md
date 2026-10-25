---
ddx:
  id: umf.evidence.rust-migration.r8-spark-projection-resource-authority
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: CONTRACT-017
      kind: informed_by
    - id: US-017
      kind: informed_by
---

# R8 Spark projection schema authority

This pair covers the directed Spark-to-Arrow result schema and Arrow-to-Spark
result schema. Their governing clauses are CONTRACT-017 sections “Directed
Spark-to-Arrow projection” (lines 220–258) and “Directed Arrow-to-Spark
projection” (lines 260–294), with acceptance criteria US-017-AC6 and AC7.
Both resources are exported from `src/index.ts`.

`scripts/spark-arrow-schema.ts` constructs the forward report schema directly.
`scripts/arrow-spark-schema.ts` reads that generated schema, changes the `$id`
and policy grammar, and emits the reverse schema. The R8 ledger pins these
exact inputs, both generators, the two governing artifacts, the public exports,
and the `dist/spec/` build/archive path. Neither generator depends on another
unlisted schema resource.

Both generators now accept `--check`. Check mode compares the deterministic
rendering against the existing output and fails on missing or stale bytes
without writing. The focused test verifies each output hash remains unchanged
after its generator check. This establishes source and package-build closure;
installed archive bytes remain unqualified.

| Generated resource | Generator | SHA-256 |
| --- | --- | --- |
| `spec/projections/spark-arrow.schema.json` | `scripts/spark-arrow-schema.ts` | `e095d0c02d0e22d67e65ff077330cb38187d887ec76fc93da8149d41ba1b8351` |
| `spec/projections/arrow-spark.schema.json` | `scripts/arrow-spark-schema.ts` | `4b48281dce847292d3c549d325efc462c0bdafddfcbfea36e80ffa9770c8fcdc` |

Validation: both generator checks passed; the ledger check passed; focused R8
tests passed 14/14. Ledger SHA-256:
`1bf0389856c5b5db235ac093a836d75b6266a795e77155d811e5198d584536d3`.
Resource-authority counts at this checkpoint are 20 generated-known, 13
authored-known, 103 candidate-generated and 62 unresolved aliases. The global
inventory cohort is still moving; final counts require parent recapture.
