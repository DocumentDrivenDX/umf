---
ddx:
  id: umf.sdk-release-notes-0.5.6
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-081
      kind: informed_by
    - id: SD-007
      kind: informed_by
    - id: TD-085
      kind: informed_by
    - id: STP-085
      kind: informed_by
    - id: umf.plan.schema-migrations
      kind: informed_by
---

# UMF SDK 0.5.6 candidate

## Release Scope

This candidate implements MIG-G02 typed per-row backfills. Selected versions are
SDK 0.5.6, `umf_access` 0.1.0.dev8, `umf_codegen` 0.1.0a5 and Weft 0.4.53.
Original semantic-core 0.10.0 distribution bytes remain unchanged. Publication,
final source and artifact identities, and platform qualification are pending.

## Changes and Ownership

The closed `umf.table-operation/0.2` declaration supports same-row Field reads,
finite literals, coalesce, strict text concatenation, exact numeric +/−/×,
and conditional expressions with literal-only predicates. UMF validates model
meaning and compiles source-bound migration plans. Weft's shared Rust core
validates the operation and its PostgreSQL backend lowers the expression and
private exact-assignment guard. The host retains connections, identity,
approval, locks, effects and recovery authority.

Migration options and plans 0.4 select one bounded derived fill. An existing
optional Field can become required through a reviewed atomic fill/tighten pair.
A newly appended required Field uses one atomic add/check/fill/default/tighten
phase. Any future default is installed after the historical fill. A matched NULL
result, nonfinite numeric input, or lossy assignment aborts the entire phase.
Native constraint and overflow errors retain their SQLSTATE while row details
are excluded from public host errors.

Administrative 0.2 operations are excluded from generated application methods;
ordinary 0.1 operations remain available. Historical profiles retain their
semantics. The additive Rust UMF migration path remains scoped to profiles
0.1/0.2; it does not implement profiles 0.3/0.4. G01's existing-field fill/tighten
behavior retains its separate qualification and regression coverage.

## Migration and Recovery

Retain both exact sources and review the compiled plan against the installed
predecessor. Existing input Fields must preserve logical, native, facet and
mapping meaning. Record host approval independently of the authored plan.
Keep generated clients fenced until final publication. After an uncertain
commit response, observe authenticated progress before resuming; a committed
fill must never be dispatched again. Committed data changes require a separately
reviewed forward repair or an independently retained backup.

## Qualification and Limits

Final frozen-cohort evidence and independent release signoff are pending.
Preliminary local PostgreSQL 18.6 and Chromium results do not establish hosted
database, additional platform, or private consumer acceptance.

The selected subset is a fenced maintenance migration on one existing table
and one target, with at most 10,000 selected rows. Expression depth is at most
16, node count 256, fanout 32 and literal payload 1 MiB; exact numeric inference
is bounded to 1,000 digits at every node. Numeric input storage requires finite
`numeric(p,s)` with nonnegative scale no greater than precision; unbounded
numeric storage is outside this profile. Hosts also impose statement and lock
timeouts. The public result-frame limit does not bound PostgreSQL's private
expression memory.

Arbitrary SQL, callbacks, joins, casts, floating arithmetic and ambient state
are outside this profile. Inputs cannot include the target, newly appended
siblings, generated values or uninterpreted selected meaning. Appended domain
CHECKs must permit NULL staging. Adding keys, foreign keys or cross-column
constraints alongside an appended derived target is outside this profile.
Existing unchanged native constraints remain effective.

| Residual | Separate scope remaining after G02 |
| --- | --- |
| MIG-G03 | General changes to existing-column future defaults. |
| MIG-G04 | Narrowing, cross-family casts and shadow rewrites. |
| MIG-G05 | Retained-value retirement windows and reversible deletion. |
| MIG-G06 | Online chunked backfills with concurrent application writes. |
| MIG-G07 | Cross-document and coordinated multi-store migrations. |
| MIG-G08 | Genuine migration qualification for Truss, Ashlar and other backends. |
| MIG-G09 | Actual managed consumer acceptance on an authorized isolated target; local PostgreSQL evidence is insufficient. |
| MIG-G10 | Initial publication and table-inventory changes in the phased successor profiles. |
| MIG-G11 | Combined drop/append replacement of columns in one existing-table migration. |

No Praxis code or managed target is changed by this release.

## References

- [G02 design and ownership](../02-design/solution-designs/SD-007-schema-migrations.md)
- [Selected declaration and execution contract](../02-design/contracts/CONTRACT-081-table-lifecycle.md)
- [Acceptance plan](../03-test/test-plans/STP-085-typed-actions-on-raw-tables.md)
- [Implementation checkpoints and evidence](../04-build/evidence/mig-g02/continuation.json)
