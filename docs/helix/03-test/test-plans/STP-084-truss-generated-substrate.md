---
ddx:
  id: STP-084
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-084
      kind: informed_by
    - id: TD-084
      kind: informed_by
---

# STP-084: Qualify a generated Truss storage substrate

## Story Reference

**User Story:** [[US-084-truss-generated-substrate]].
**Technical Design:** [[TD-084-truss-generated-substrate]].
**Related Solution Design:** [[SD-029]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove this story's supported scope and named refusals. Blocking gates are the
commands below and `bun scripts/check-compilation-boundaries.ts`. All tests,
fixtures and commands in this plan are proposed and **UNTESTED** until created
and executed; table citations specify required future test-source annotations.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-084-AC1 | `truss_does_not_create_domain_tables` | Assert no per-domain DDL/index/partition and exact property/key identity; isolated objects/edge properties and unknowns remain. | `@covers US-084-AC1` |
| US-084-AC2 | `truss_admission_cannot_be_bypassed` | Assert no direct registry mutation, custody fabrication, privilege escalation, ORM autoflush or hidden retry. | `@covers US-084-AC2` |
| US-084-AC3 | `truss_mutation_witness_matches` | Compare original native observations for full selected operation rather than generated rows alone. | `@covers US-084-AC3` |
| US-084-AC4 | `truss_failure_and_concurrency_match` | Assert no partial journal/feed, same stale refusal, no replay after uncertain commit and no duplicate live write. | `@covers US-084-AC4` |
| US-084-AC5 | `truss_incomplete_proof_blocks_switch` | Assert ADOPTION_INCOMPLETE/MISMATCH, exact evidence retention and explicit scope; no substitute routines are manufactured. | `@covers US-084-AC5` |

## Executable Proof

Planned primary commands (not currently implemented):

```sh
python3 scripts/compilation-truss-conformance.py --packet fixtures/compilation/adoption/truss.json
```

Planned files: `tests/compilation/python/test_truss_adoption.py`. Python commands must use the isolated exact
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

Original accepted Truss physical model and domain model, protected operation issuer, native owned fixture; missing/null/unknown properties, composite keys, edge with properties. All fixtures must retain provenance and independent expected
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
