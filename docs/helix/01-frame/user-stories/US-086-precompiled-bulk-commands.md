---
ddx:
  id: US-086
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-030
      kind: informed_by
---

# US-086: Run precompiled bulk commands

**Feature:** [[FEAT-030]]. **Feature Requirements:** AT-05, AT-09; FEAT-029 QC-03.
**PRD Requirements:** FR-54. **Priority:** P0 within the proposal.

## Story

**As an** Application Developer,
**I want** to declare a bulk change such as "deactivate customers not seen since
a cutoff" as a typed command, preview what it will touch, and run it as one
atomic change on my raw tables,
**So that** set-based updates obey the named action's rules and a fixed size
limit, and never run SQL assembled from runtime input.

## Context

A bulk command is a CONTRACT-071 declaration such as
`Customer.objects.filter(Customer.c.last_seen < cutoff).update(active=False)`
bound to a UMF action. The catalog build compiles it through Weft's mutation
compiler through the distinct native-bulk/0.1 program interface required by CONTRACT-071/073. Weft CONTRACT-006's existing frozen/batch CONTRACT-902 path is not that native interface; raw commands stay WEFT_BLOCKED until the new owner output qualifies. The generated function returns a
`BulkPlan`.

Weft's plans embed constant values, so at run time the target asks the pinned
Weft compiler to instantiate the plan with the validated parameter values and
checks that the statement structure did not change. On raw tables the whole
command runs as one atomic unit under the same CONTRACT-073 rules as actions,
bounded by the plan's `maxItems`. Frozen manifests (CONTRACT-903) and batched
coordination (CONTRACT-904) need durable control state that raw tables do not
have, so they are used only on Truss (US-087).

## Walkthrough

1. The developer declares a command with `@command(action=DeactivateCustomer)`.
   The type checker validates the `.update(...)` fields and values.
2. The catalog build compiles it for each selected raw-table target, recording
   the complete native program, source/profile pins and Weft-owned versioned structural digest.
3. The service calls `deactivate_stale(target, cutoff=...)` and gets a
   `BulkPlan`.
4. `plan.preview()` shows the bounded set of selected identities and a statement
   summary, without writing.
5. `plan.execute()` changes every selected row or none, or refuses.

## Acceptance Criteria

- [ ] **US-086-AC1** — Given a `@command` whose `.update(**values)` names only mutable Fields of required boolean, integer or string type with values of the right type, when the developer type-checks and runs the catalog build, then pinned pyright and mypy accept it and reject unknown, immutable or wrongly typed fields, and the catalog records, per raw-table target, the Weft statement template, parameter carriers, `maxItems` and structural digest; a command Weft blocks fails the build with `WEFT_BLOCKED` and Weft's diagnostics.
- [ ] **US-086-AC2** — Given a compiled command and a verified raw-table target, when the developer calls `preview()`, then the preflight and selection run read-only and return the selected identities (at most `maxItems`) and a statement summary, and an independent observation shows no table version or row changed.
- [ ] **US-086-AC3** — Given a selection within `maxItems`, when the developer calls `execute()`, then the preflight, selection and update run as one atomic unit under the CONTRACT-073 rules for that platform, every selected row is updated or none is, and conflict and lost-commit cases raise `ActionConflict` and `ActionIndeterminate` exactly as for single actions.
- [ ] **US-086-AC4** — Given a selection that matches `maxItems + 1` or more rows, when the developer calls `preview()` or `execute()`, then the command refuses with `BULK_LIMIT`, returns no truncated selection, and leaves every row unchanged.
- [ ] **US-086-AC5** — Given runtime plan instantiation whose structural digest differs from the catalog's, when the developer calls `preview()` or `execute()`, then the command refuses with `PLAN_DRIFT` before any statement is sent to the target.
- [ ] **US-086-AC6** — Given a raw-table `BulkPlan`, when the developer needs resumable or batched execution, then the plan exposes no `seal()` (pinned type checkers report the attribute as unknown), no CONTRACT-903 manifest or CONTRACT-904 control state is created, and the Truss manifest path remains governed by US-087.
- [ ] **US-086-AC7** — Given a compiled command on a verified `postgresql` or `lakebase` target whose table another connection has locked, when the developer calls `execute(timeout=timedelta(milliseconds=200))`, then it raises `ActionTimedOut` and no selected row changed; and when the deadline instead passes after the commit is sent, the call never raises `ActionTimedOut` and is decided as for a lost commit (US-085-AC4).

## Edge Cases

- `SET` to null, decimal or other scalar domains, key edits and missing `WHERE`
  are outside `weft-mutation/0.1.0` and refuse at build.
- The named action's refusals from US-085 apply to the command on the same
  target (for example `person-required` or an unmapped role).
- On `spark-delta`, a command qualifies only if Weft lowers the bound check,
  preflight and update into one statement whose over-limit result changes
  nothing; otherwise it refuses at build.
- An empty selection previews as empty and executes as a committed no-op.
- A connection already inside a transaction refuses with `TRANSACTION_STATE`.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| bulk_command_compiles_typed | US-086-AC1 | Valid and invalid `.update` declarations; Weft-blocked forms | Checker diagnostics; catalog entries with digest and `maxItems`; `WEFT_BLOCKED` |
| bulk_preview_is_read_only | US-086-AC2 | Seeded rows matching the predicate | Bounded identities and summary; no version change |
| bulk_execute_all_or_nothing | US-086-AC3 | Matching rows; injected failure, conflict and commit loss | All rows or none updated; `ActionConflict`; `ActionIndeterminate` |
| bulk_over_limit_refuses | US-086-AC4 | `maxItems + 1` matching rows | `BULK_LIMIT`; no rows changed; no truncated list |
| bulk_plan_drift_refuses | US-086-AC5 | Catalog digest that differs from instantiation | `PLAN_DRIFT`; zero statements sent |
| bulk_raw_has_no_manifest_path | US-086-AC6 | Raw-table `BulkPlan`; static `seal()` call | Checker error; no manifest or control rows |
| bulk_timeout_commits_nothing | US-086-AC7 | Locked table before commit; deadline after commit sent | `ActionTimedOut` with no change; commit-loss rules after the commit is sent |

## Dependencies

US-082 (DSL capture and static typing), US-083 (catalog build and `verify()`) and
US-085 (raw-table transaction and outcome rules). CONTRACT-071, CONTRACT-072,
CONTRACT-073 native-bulk/0.1; Weft CONTRACT-006 plus the required separate native interface and raw-table mutation selection
backends (W-3). Feature requirements: AT-05, AT-09 and FEAT-029 QC-03; PRD FR-54.
TD-086 owns implementation detail; STP-086 owns the test mapping.

## Out of Scope

Frozen manifests, batched or resumable execution and job control on raw tables;
the Truss bulk path (US-087). Bulk create or delete, computed assignments and
mutation domains Weft does not admit. A Weft plan-template capability that would
remove the runtime Weft call (W-3, Weft WR-I5).
