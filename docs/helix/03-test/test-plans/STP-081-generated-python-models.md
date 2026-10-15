---
ddx:
  id: STP-081
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-081
      kind: informed_by
    - id: TD-081
      kind: informed_by
---

# STP-081: Use generated Python instance models

## Story Reference

**User Story:** [[US-081-generated-python-models]].
**Technical Design:** [[TD-081-generated-python-models]].
**Related Solution Design:** [[SD-028]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove this story's supported scope and named refusals. Blocking gates are the
commands below and `bun scripts/check-compilation-boundaries.ts`. All tests,
fixtures and commands in this plan are proposed and **UNTESTED** until created
and executed; table citations specify required future test-source annotations.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-081-AC1 | `presence_survives_codecs` | Assert empty patch encodes empty mapping; explicit bound null remains None; required omission, forbidden null/read-only/key patch fail; every default.on trigger remains preserved without substitution; equal cross-module bare IDs refuse; sentinel never enters transport. | `@covers US-081-AC1` |
| US-081-AC2 | `exact_values_refuse_loss` | Assert bool/string coercions, float Decimal input, scale/width overflow, timezone invention and excess precision refuse; accepted values round-trip exactly. | `@covers US-081-AC2` |
| US-081-AC3 | `nested_state_is_revalidated` | Assert invalid nested mutation and model_construct bypass fail; input values are not modified; errors do not render values. | `@covers US-081-AC3` |
| US-081-AC4 | `static_contract_is_inspectable` | Assert unknown attribute, wrong named result and incompatible constructor/key uses fail without missing-import errors; renamed aliases, sentinel narrowing, underscore/inherited names and dependency-shadowing controls exercise both static/runtime behavior; runtime nominal limitations remain explicit. | `@covers US-081-AC4` |
| US-081-AC5 | `generated_package_is_independent` | Assert isolated import with only exact runtime locks; backend import is optional and no I/O occurs. | `@covers US-081-AC5` |

## Executable Proof

Planned primary commands (not currently implemented):

```sh
python3 -m pytest tests/compilation/python/test_models.py tests/compilation/python/test_static.py
 python3 -m mypy --strict fixtures/compilation/generated/positive.py
```

Planned files: `tests/compilation/python/test_models.py; tests/compilation/python/test_static.py`. Python commands must use the isolated exact
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

Missing/null/default/server-generated fields; immutable composite identity with original UMF key golden vectors (no generated key-byte encoder); Decimal("125.50"), bool-as-int, submicrosecond instant and mutated nested list; named result projection; distinct module_a.value/module_b.value alias refusal; default.on missing/null/missing-or-null matrix at nested and top-level boundaries. All fixtures must retain provenance and independent expected
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
