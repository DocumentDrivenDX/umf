---
ddx:
  id: TD-086
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-086
      kind: informed_by
    - id: SD-030
      kind: informed_by
---

# TD-086: Run precompiled bulk commands

**User Story:** [[US-086-precompiled-bulk-commands]]. **Feature:** [[FEAT-030]].
**Solution Design:** [[SD-030]].

## Scope

One journey: a `@command` bulk update compiled into the catalog and run on a
raw-table target. CONTRACT-071 owns the DSL, catalog and `PLAN_DRIFT`;
CONTRACT-072 owns `AtomicBulkPlan` and `BulkOutcome`; CONTRACT-073 owns atomicity, `maxItems` and
`BULK_LIMIT` on raw tables; Weft CONTRACT-009 owns the mutation dialect, plan and
selection lowering. The Truss path is TD-087.

## Technical Approach

**Build.** Capture renders the declaration to Weft mutation SQL
(`UPDATE <Record> SET <field> = :p ... WHERE ...`) with named parameters only.
The build calls Weft's `compileMutation` with the model, the action's CONTRACT-902
plan-model preparation and witness values of the right carriers, then lowers the
selection through the target's raw-table selection backend with the plan's
`maxItems`. It records `{sqlTemplate, parameters, maxItems, lowering summary,
structuralDigest}` per target, where the digest is computed over Weft's plan and
lowering with parameter values removed. A blocked response fails the build with
`WEFT_BLOCKED`. The named action's CONTRACT-073 refusals (US-085) are applied to
the command on the same target.

**Instantiate.** The generated function validates arguments with CONTRACT-068
codecs and calls `target.plan(entry, params)`. The target calls the pinned Weft
compiler with the recorded template and the validated values, lowers the
selection again, recomputes the structural digest and compares it with the
catalog. A difference raises `PLAN_DRIFT` before any connection use. This is the
only runtime use of Weft; a Weft plan-template capability (W-3, Weft WR-I5) would replace it.

**Preview.** On `postgresql`/`lakebase`, `preview()` opens a `READ ONLY`
`SERIALIZABLE` transaction, runs the preflight and the selection with a
`maxItems + 1` sentinel, and rolls back. It returns the selected identities in
Weft's canonical order and a statement summary. On Delta targets it runs the
read-only selection query with the same sentinel. Seeing the sentinel row raises
`BULK_LIMIT`; nothing is truncated.

**Execute.** `execute()` re-instantiates the plan, checks the connection is idle
and runs the preflight, the bounded selection and the set-based update in one
`SERIALIZABLE` transaction (`postgresql`/`lakebase`), one `BEGIN ATOMIC` block
(`unity-catalog`) or one statement (`spark-delta`). The selection is re-run
inside the transaction; the preview result is advisory and is not reused. The
sentinel check aborts the unit with `ActionRefused` carrying `BULK_LIMIT`.
Outcome classification, commit-loss reconciliation and receipts reuse TD-085.
`execute()` returns `BulkOutcome {selected, changed, receipt}`, or raises
`ActionConflict`, `ActionIndeterminate`, `ActionFailed` or `ActionRefused`.

Raw-table targets are `BulkTarget[AtomicBulkPlan]`, and `AtomicBulkPlan` has no
`seal()` or `submit()` method, so a call to either is a static error; no manifest
or control state is written.

Trade-off: one bounded atomic unit instead of resumable batches. Large jobs must
use Truss or a separately designed control state.

## Component Changes

Planned files (none exist yet):

- `python/umf_access/build/commands.py` — capture-to-Weft rendering, compilation,
  structural digest and action refusals for commands.
- `python/umf_access/bulk.py` — `AtomicBulkPlan` with `preview()` and
  `execute() -> BulkOutcome`.
- `python/umf_access/targets/_bulk.py` — per-platform preview and atomic
  execution, sentinel handling.
- `python/umf_access/conformance/bulk.py` — reusable preview/execute agreement,
  limit and drift cases.

| AC | Component realization |
| --- | --- |
| US-086-AC1 | Generated `<Record>Update` TypedDict (CONTRACT-068) and `build/commands.py` catalog entries |
| US-086-AC2 | Read-only preview transaction or query with sentinel |
| US-086-AC3 | Atomic execution per platform; TD-085 classification and receipts |
| US-086-AC4 | `maxItems + 1` sentinel in preview and execute; `BULK_LIMIT` |
| US-086-AC5 | Runtime instantiation and digest comparison before connection use |
| US-086-AC6 | `AtomicBulkPlan` type without `seal()` or `submit()`; no manifest writer on raw targets |

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| `@command`, `.update(**values)` | CONTRACT-071, CONTRACT-068 | Typed declaration |
| `BulkTarget[AtomicBulkPlan].plan`, `AtomicBulkPlan.preview/execute`, `BulkOutcome` | CONTRACT-072 | Runtime surface |
| `BULK_LIMIT`, `TRANSACTION_STATE` carried by `ActionRefused` | CONTRACT-073 | Raw-table refusals |
| `PLAN_DRIFT`, `WEFT_BLOCKED` | CONTRACT-071 | Instantiation and build refusals |
| `compileMutation`, selection lowering | Weft CONTRACT-009 | Plan and selection program |

CONTRACT-072 defines `execute()` as returning `BulkOutcome {selected, changed,
receipt}` and keeps `seal()` and `submit()` on the separate Truss
`ManifestBulkPlan` type.

## Data Model Changes

Command catalog entries as described; no database migration and no control
tables.

## Integration Points

Weft CONTRACT-009 currently defines the dialect, plan and a Truss selection
backend. Raw-table selection backends and the set-based update program for
Postgres, Lakebase and Delta are the Weft dependency W-3; until they exist,
commands refuse at build on raw tables.

## Security

Only catalog templates execute, with values bound as native parameters; the
runtime Weft call receives validated typed values, never SQL text from input.
The action's role check and native privileges apply to the whole unit. Preview
reveals only rows the session may already read. Errors do not include parameter
values.

## Testing

| AC | Test | Assertion | Owner |
| --- | --- | --- | --- |
| US-086-AC1 | `bulk_command_compiles_typed` | Checker diagnostics for bad fields and values; catalog entry members; `WEFT_BLOCKED` with Weft diagnostics | UMF static and build tests |
| US-086-AC2 | `bulk_preview_is_read_only` | Identities equal an independent query; table versions and txid unchanged | UMF conformance + native lane |
| US-086-AC3 | `bulk_execute_all_or_nothing` | All selected rows changed or none; conflict and commit-loss outcomes as TD-085 | UMF conformance + native lane |
| US-086-AC4 | `bulk_over_limit_refuses` | `BULK_LIMIT` at `maxItems + 1`; success at exactly `maxItems`; no row changed on refusal | UMF conformance + native lane |
| US-086-AC5 | `bulk_plan_drift_refuses` | `PLAN_DRIFT`; recording connection sees zero statements | UMF conformance |
| US-086-AC6 | `bulk_raw_has_no_manifest_path` | Static error for `seal()`; no manifest or control objects after execute | UMF static and conformance |

STP-086 owns the authoritative mapping and commands.

## Migration & Rollback

New capability. Removing a command and regenerating the catalog withdraws it.
Committed bulk changes are not reversed by reverting code; a reversal is a new,
separately reviewed command.

## Implementation Sequence

1. Write static and conformance cases first, including the exact-limit pair.
2. Implement build compilation and the digest, then instantiation and drift.
3. Implement preview and execute on Postgres, then Lakebase, then Delta targets.
4. Retain evidence per platform; qualify only what passed.

Prerequisites: US-082, US-083, US-085, W-3.

## Risks

The runtime Weft call adds latency and a dependency on the Weft binding in
production until W-3 (Weft WR-I5) lands. Weft may not express a bounded single-statement
update on Delta; such commands refuse there. Concurrent writers can make
`execute()` select a different set than `preview()` showed; that is expected
and documented, and the limit is checked again inside the unit.
