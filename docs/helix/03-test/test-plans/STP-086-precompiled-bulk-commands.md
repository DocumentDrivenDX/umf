---
ddx:
  id: STP-086
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-086
      kind: informed_by
    - id: TD-086
      kind: informed_by
---

# STP-086: Run precompiled bulk commands

## Story Reference

**User Story:** [[US-086-precompiled-bulk-commands]].
**Technical Design:** [[TD-086-precompiled-bulk-commands]].
**Related Solution Design:** [[SD-030]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove that typed bulk commands compile only in Weft's supported mutation subset,
preview without writing, execute as one bounded atomic unit on each raw-table
platform, and refuse over-limit selections and plan drift without effect. The
Truss manifest path is out of scope here and is planned in STP-087.

All tests, fixtures and commands in this plan are planned and **UNTESTED** until
created and executed. The citations below are required future test-source
annotations, not coverage.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-086-AC1 | `bulk_command_compiles_typed` (static cases `tests/static/bulk_update_good.py` and `bulk_update_bad.py`; build test) | Pyright and mypy accept the positive file and report unknown, immutable and wrongly typed `.update` fields in the negative file; each target entry holds template, carriers, `maxItems` and structural digest; declarations that type-check but fall outside `weft-mutation/0.1.0` (setting a nullable Field to `None`, assigning a decimal Field) fail the build with `WEFT_BLOCKED` and Weft's retained diagnostics. | `@covers US-086-AC1` |
| US-086-AC2 | `bulk_preview_is_read_only` (conformance case `bulk.preview`) | Returned identities equal an independent query in Weft's canonical order; Postgres txid counter and Delta table versions are unchanged after preview. | `@covers US-086-AC2` |
| US-086-AC3 | `bulk_execute_all_or_nothing` (conformance case `bulk.execute`, with injected statement failure, concurrent writer and commit-loss wrapper) | On success every selected row has the new values, no other row changed, and `BulkOutcome` reports `selected` and `changed` equal to independent counts with the commit receipt; on injected failure `ActionFailed` is raised and no row changed; conflict raises `ActionConflict` with `retained=False`; commit loss behaves as for single actions (US-085-AC4), raising `ActionIndeterminate` when not reconciled, and no retry is sent. | `@covers US-086-AC3` |
| US-086-AC4 | `bulk_over_limit_refuses` (conformance case `bulk.limit`) | Exactly `maxItems` matches execute; `maxItems + 1` matches raise `ActionRefused` with `BULK_LIMIT` from both `preview()` and `execute()`, return no partial list, and leave all rows unchanged. | `@covers US-086-AC4` |
| US-086-AC5 | `bulk_plan_drift_refuses` (conformance case `bulk.drift` using a catalog fixture whose recorded digest differs) | `preview()` and `execute()` raise `PLAN_DRIFT`; the recording connection sees zero statements. | `@covers US-086-AC5` |
| US-086-AC6 | `bulk_raw_has_no_manifest_path` (static case plus conformance case `bulk.no_manifest`) | A `plan.seal()` or `plan.submit(...)` call on a raw-table plan is a checker error; after `execute()` no manifest, job or control objects exist in the target schema. | `@covers US-086-AC6` |

## Executable Proof

Planned commands (none exist yet):

```sh
python -m pytest python/umf_access/tests/static/test_bulk_update_typing.py
python -m pytest python/umf_access/tests/build/test_commands.py
python -m pytest python/umf_access/tests/native/test_bulk.py --umf-target postgresql
python -m pytest python/umf_access/tests/native/test_bulk.py --umf-target lakebase
python -m pytest python/umf_access/tests/native/test_bulk.py --umf-target spark-delta
python -m pytest python/umf_access/tests/native/test_bulk.py --umf-target unity-catalog
```

The native module runs the shared `umf_access.conformance` bulk cases
(`python/umf_access/conformance/`). Commands run separately in the pinned
profile environment with the pinned Weft binding, and each status is retained.
Evidence goes under `docs/helix/04-build/evidence/typed-persistence/` with the
Weft version, catalog digest, platform version, command, status, and expected
and observed rows. Unrun platforms are recorded as not run.

## Data and Setup

The `Customer` model from CONTRACT-071 (`active` boolean, `last_seen` integer,
string Key) and the `DeactivateCustomer` action. Seed sets of 0, 1, `maxItems`
and `maxItems + 1` matching rows plus non-matching rows. A plan with a small
`maxItems` (for example 5) keeps limit tests fast. A drifted catalog fixture is
produced by changing only the recorded digest. Owned isolated schemas with
explicit cleanup; independent queries supply expected values.

## Edge Cases and Failure Modes

Empty selection (empty preview, committed no-op), connection mid-transaction
(`TRANSACTION_STATE`), named-action refusals inherited from US-085, and Delta
commands Weft cannot lower to one statement (build refusal).

## Build Handoff

Create the static corpus and conformance cases first, then implement build,
instantiation, preview and execute in TD-086's order. Every AC needs an
exercising assertion carrying its `@covers` tag. A platform is done only when
all its cases pass with retained evidence; support is claimed per platform
version only.
