---
ddx:
  id: STP-085
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-085
      kind: informed_by
    - id: TD-085
      kind: informed_by
---

# STP-085: Qualify a generated Ashlar storage substrate

## Story Reference

**User Story:** [[US-085-ashlar-generated-substrate]].
**Technical Design:** [[TD-085-ashlar-generated-substrate]].
**Related Solution Design:** [[SD-030]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove this story's supported scope and named refusals. Blocking gates are the
commands below and `bun scripts/check-compilation-boundaries.ts`. All tests,
fixtures and commands in this plan are proposed and **UNTESTED** until created
and executed; table citations specify required future test-source annotations.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-085-AC1 | `ashlar_reads_preserve_vector` | Compare all original table UUID/version pairs, presence, exact values and parallel-edge IDs; no scalar vector summary. | `@covers US-085-AC1` |
| US-085-AC2 | `ashlar_stale_read_refuses` | Assert no fallback, no empty-graph success and no retained prior authorization used as current authority. | `@covers US-085-AC2` |
| US-085-AC3 | `ashlar_publication_is_not_table_commit` | Assert manifest does not advance on partial roles; replay uses original receipts and no independent generated write. | `@covers US-085-AC3` |
| US-085-AC4 | `ashlar_ack_and_fencing_match` | Assert original destination/source evidence and fresh read-only ACK reconciliation; no second ACK or publication on uncertainty. | `@covers US-085-AC4` |
| US-085-AC5 | `ashlar_support_scope_is_honest` | Assert local-only packet cannot claim managed UC/production authority; profile changes require requalification and original selection survives failure. | `@covers US-085-AC5` |

## Executable Proof

Planned primary commands (not currently implemented):

```sh
python3 scripts/compilation-ashlar-conformance.py --packet fixtures/compilation/adoption/ashlar.json
```

Planned files: `tests/compilation/python/test_ashlar_adoption.py`. Python commands must use the isolated exact
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

Original Ashlar runtime UMF schemas, retained full UUID/version vector and source/ACK receipts; parallel edges, old/new publication, expired/replaced snapshot and partial commit. All fixtures must retain provenance and independent expected
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
