---
ddx:
  id: STP-080
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-080
      kind: informed_by
    - id: TD-080
      kind: informed_by
---

# STP-080: Compile a reviewable persistence bundle

## Story Reference

**User Story:** [[US-080-compile-persistence-bundle]].
**Technical Design:** [[TD-080-compile-persistence-bundle]].
**Related Solution Design:** [[SD-028]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove this story's supported scope and named refusals. Blocking gates are the
commands below and `bun scripts/check-compilation-boundaries.ts`. All tests,
fixtures and commands in this plan are proposed and **UNTESTED** until created
and executed; table citations specify required future test-source annotations.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-080-AC1 | `bundle_is_reproducible` | Compare every file byte, SHA-256, manifest and diagnostic; changing source/profile changes input digest. | `@covers US-080-AC1` |
| US-080-AC2 | `relevant_unknown_refuses` | Assert no candidate files for selected unknown; exact original source archive for both cases; complete assertion census. | `@covers US-080-AC2` |
| US-080-AC3 | `unresolved_meaning_refuses` | Assert missing reference and target choice refuse; original inputs remain unchanged. | `@covers US-080-AC3` |
| US-080-AC4 | `unsafe_output_refuses` | Assert keyword/case-fold collisions and path escape refuse; escaped literal cannot execute; no truncation success. | `@covers US-080-AC4` |
| US-080-AC5 | `writer_preserves_user_edits` | Assert ownership mismatch refuses; injected staging/selection failures preserve prior directory; symlink refuses. | `@covers US-080-AC5` |
| US-080-AC6 | `report_mode_is_conservative` | Assert strict refuses; report retains safe loss; write-broadening and unknown semantics refuse in both modes. | `@covers US-080-AC6` |

## Executable Proof

Planned primary commands (not currently implemented):

```sh
bun test tests/compilation/compiler.test.ts tests/compilation/writer.test.ts
```

Planned files: `tests/compilation/compiler.test.ts; tests/compilation/writer.test.ts`. Python commands must use the isolated exact
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

fixtures/compilation/commerce/ with Customer, Order and OrderLine; explicit ordered composite keys; unknown selected/unselected metadata; hostile names and old output manifest. All fixtures must retain provenance and independent expected
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
