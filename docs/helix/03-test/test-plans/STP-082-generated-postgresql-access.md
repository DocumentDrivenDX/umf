---
ddx:
  id: STP-082
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-082
      kind: informed_by
    - id: TD-082
      kind: informed_by
---

# STP-082: Use generated PostgreSQL access declarations

## Story Reference

**User Story:** [[US-082-generated-postgresql-access]].
**Technical Design:** [[TD-082-generated-postgresql-access]].
**Related Solution Design:** [[SD-029]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove this story's supported scope and named refusals. Blocking gates are the
commands below and `bun scripts/check-compilation-boundaries.ts`. All tests,
fixtures and commands in this plan are proposed and **UNTESTED** until created
and executed; table citations specify required future test-source annotations.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-082-AC1 | `postgresql_binding_matches_native` | Use independent catalogs and native insert/select/refusal observations; preserve association fields and quoted names. | `@covers US-082-AC1` |
| US-082-AC2 | `no_fake_orm_identity` | Assert Core declaration is emitted and no Entity identity map or fabricated primary key exists. | `@covers US-082-AC2` |
| US-082-AC3 | `postgresql_codec_matches_native` | Assert precision/scale, integer width, timestamp and client/server defaults; qualified domain/collation limitations remain visible. | `@covers US-082-AC3` |
| US-082-AC4 | `postgresql_has_no_execution_authority` | Assert no engine/session factory, save/delete helper or import I/O; explicit relationship lazy=raise/no cascades. | `@covers US-082-AC4` |
| US-082-AC5 | `schema_drift_blocks_adoption` | Assert native-schema mismatch blocks use; manifests cannot claim installed enforcement from source hashes. | `@covers US-082-AC5` |

## Executable Proof

Planned primary commands (not currently implemented):

```sh
bun test tests/compilation/postgresql.test.ts
python3 scripts/compilation-postgresql-oracle.py --profile fixtures/compilation/profiles/postgresql.json
```

Planned files: `tests/compilation/postgresql.test.ts; tests/compilation/python/test_postgresql.py`. Python commands must use the isolated exact
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

Commerce bound tables, composite FK, association with fields, no-PK table, SQL NULL uniqueness, collation distinction, decimals and default origins. All fixtures must retain provenance and independent expected
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
