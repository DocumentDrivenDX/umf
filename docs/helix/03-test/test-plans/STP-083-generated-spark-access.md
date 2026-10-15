---
ddx:
  id: STP-083
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-083
      kind: informed_by
    - id: TD-083
      kind: informed_by
---

# STP-083: Use generated Spark and catalog declarations

## Story Reference

**User Story:** [[US-083-generated-spark-access]].
**Technical Design:** [[TD-083-generated-spark-access]].
**Related Solution Design:** [[SD-030]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove this story's supported scope and named refusals. Blocking gates are the
commands below and `bun scripts/check-compilation-boundaries.ts`. All tests,
fixtures and commands in this plan are proposed and **UNTESTED** until created
and executed; table citations specify required future test-source annotations.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-083-AC1 | `spark_schema_matches_native` | Assert StructField/ArrayType/MapType metadata and nullability; nullable map keys and unsupported metadata refuse. | `@covers US-083-AC1` |
| US-083-AC2 | `spark_exact_values_are_qualified` | Assert decimal boundaries, epoch-microsecond text projection versus raw naive TimestampType, NTZ and process/session timezone differences, and ANSI overflow under exact locks; DST overlap, negative epochs, microsecond and range boundaries; no silent cast or setting changes. | `@covers US-083-AC2` |
| US-083-AC3 | `spark_result_type_requires_schema` | Assert wrong/missing/duplicate columns fail even with zero rows; arbitrary raw expressions have no unchecked typed cast. | `@covers US-083-AC3` |
| US-083-AC4 | `spark_generation_is_passive` | Assert no SparkSession creation, collect/toLocalIterator/MERGE or schema-evolution action is emitted. | `@covers US-083-AC4` |
| US-083-AC5 | `catalog_claims_are_separate` | Assert informational PK/FK/unique and no RELY; managed native case is not-run without dedicated endpoint and cannot count as local pass. | `@covers US-083-AC5` |

## Executable Proof

Planned primary commands (not currently implemented):

```sh
bun test tests/compilation/spark.test.ts
python3 scripts/compilation-spark-oracle.py --profile fixtures/compilation/profiles/spark.json
```

Planned files: `tests/compilation/spark.test.ts; tests/compilation/python/test_spark.py; tests/compilation/python/test_unity_catalog.py`. Python commands must use the isolated exact
profile environment, never an unpinned global install. The build runner must
invoke commands separately and retain each status; a later success cannot hide
an earlier failure. Static-negative tests assert expected diagnostics and a
nonzero status, including controls showing their imports resolved correctly.
Compiler byte-parity cases additionally run in actual Chromium via a planned
`bun scripts/compilation-browser.ts` harness.

Retain results under `docs/helix/04-build/evidence/typed-persistence/` with exact
inputs/profile/tool versions, command, status, expected/observed facts, raw native
custody references and capture limits. No acceptance artifact exists yet.

## Data and Setup

Nested structs/arrays/maps with entry-nullability, Decimal limits, instant/local timestamps, session config mismatch, empty result and informational catalog keys. All fixtures must retain provenance and independent expected
values. Development fixtures cannot establish production policy or native
execution authority. Native tests use owned isolated resources and explicit
cleanup; managed tests require an explicitly dedicated endpoint. A missing
endpoint yields not-run, never a passing local substitute.

## Edge Cases and Failure Modes

Exercise the named loss/refusal cases, changed pins, absent evidence and partial
outcomes. Require original source retention and no semantic inference. No test
may double-execute a live mutation to compare implementations.

## Build Handoff

Create fixtures and red tests first; implement the story module; run the scoped
gates; retain complete independent observations and review semantic differences.
All ACs must have actual exercising assertions and the required `@covers` tags.
A test name or citation in this planning document is not coverage.

Done only when all in-scope cases pass with evidence. Generation, local-native,
managed-native and protected-consumer lanes remain distinct. Blocked required
lanes leave corresponding support/adoption incomplete.
