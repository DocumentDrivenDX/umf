---
ddx:
  id: umf.sdk-release-notes-0.5.7
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

# UMF SDK 0.5.7 candidate

## Release scope

SDK 0.5.7 is selected for typed per-row PostgreSQL backfills. Publication date,
final source commit and artifact hashes remain unset until candidate qualification
and independent review pass. The release owner is the UMF implementation workstream.
The earlier SDK 0.5.6 backfill candidate remains a historical qualification record;
the published `umf-v0.5.6` release instead delivers Core 0.10.1.

The selected stack uses Access 0.1.0.dev8, Codegen 0.1.0a5 and published Weft
0.4.53. Core 0.10.1 is reused byte-for-byte from its published producer commit
`259bf1ed91466ff7e9782d7517c14f2112282026`. Its embedded metamodel manifest
retains that producer's SDK 0.5.6 input fingerprint. SDK 0.5.7 has its own input
fingerprint; the document semantic version remains 0.10.0. No Core artifact is
rebuilt under the existing 0.10.1 coordinate.

## Audience and channels

| Audience | Impact | Channel |
| --- | --- | --- |
| Python embedders | Select exact runtime artifacts and a qualified interpreter/platform cell. | Release assets and the wheel-mirror guide. |
| Migration operators | Review the retained sources, operation, effect bound and recovery authority. | Lifecycle guide and release notes. |

## Highlights

One declared expression can derive a target from unchanged Fields in the same
row. The expression supports copy, coalesce, strict text concatenation, exact
finite arithmetic and conditional branches. UMF checks meaning and migration
identity; Weft admits native types and generates SQL; the host owns approval,
connections, locks, execution and recovery.

## Changes and fixes

Migration options and plans 0.4 select one NULL-only fill on one existing table.
An existing optional target can be filled and made required atomically. One new
required target can be added, checked, filled, given its authored future default
and made required within one transaction. Present target values and input values
are preserved. A NULL result, nonfinite numeric input, lossy assignment or native
constraint failure aborts the phase, including its DDL and completion receipt.
Admission has a separate durable boundary: it records READY progress and fences
ordinary writes before the phase starts. A known phase failure preserves that
authenticated READY receipt with no completed phase; it does not reopen writes.
Successful final publication advances history and removes transient progress.

Administrative operation 0.2 remains separate from ordinary application methods.
Public host errors retain SQLSTATE while excluding native row details. The UMF
Rust migration compiler continues to refuse the successor migration profile.
Historical operation and migration versions retain their selected grammar and
replay semantics.

## Breaking changes and required actions

Existing profiles keep their behavior. Operators must explicitly select the
successor migration profile and install a compatible reviewed stack before using
row expressions. A successful portable compile grants no database authority.

## Migration or rollback guidance

Retain both exact JSON sources and approve the source-bound plan against the
installed predecessor. Inputs must preserve their logical type, native mapping
and facets. Keep clients fenced until publication. After an uncertain commit
response, observe authenticated progress before resuming; committed fills must
never be dispatched again. Repair of committed data requires separately reviewed
forward changes or independently retained backups.
After a known failed phase, retain its exact approval, plan and file bindings and
follow the host's authenticated recovery procedure while ingress remains fenced.

## Known issues and support

The selected profile is a maintenance migration with at most 10,000 matched rows.
Expressions have at most 256 nodes, depth 16 and fanout 32. Decoded literal payloads
are limited to 1 MiB each; numeric inference is limited to 1,000 digits per node.
Every referenced numeric input must be finite, including inputs in an unused
conditional branch. The public 8 MiB result-frame limit does not bound privileged
PostgreSQL expression memory. NULL concatenation and predicate comparison follow
the [declared expression semantics](../02-design/solution-designs/SD-007-schema-migrations.md#type-null-and-exactness-semantics).
Decimal storage requires finite precision and nonnegative scale. Inputs exclude
the target, newly appended siblings, generated values and unknown selected meaning.
SQL strings, callbacks, joins, casts, floating arithmetic and online writes remain
outside the profile.

Appended checks must permit NULL staging. A retained create command must already
supply a required appended Field or its declared default; otherwise admission
refuses with `TABLES_OPERATION_REQUIRED`. Compound source changes, future-default
mutation, column replacement and the remaining migration workstreams retain their
separate design and qualification gates. G03 work in another checkout does not
expand this release. Managed consumer acceptance and Praxis changes are outside
the release's local PostgreSQL qualification.

| Remaining gap | Scope after this release |
| --- | --- |
| MIG-G03 | Existing-column future-default changes; separate implementation and native qualification. |
| MIG-G04 | Narrowing, cross-family casts and shadow rewrites. |
| MIG-G05 | Retained-value retirement and reversible deletion. |
| MIG-G06 | Online chunked backfills with concurrent application writes. |
| MIG-G07 | Cross-document and coordinated multi-store migrations. |
| MIG-G08 | Migration qualification for Truss, Ashlar and additional backends. |
| MIG-G09 | Managed acceptance on an authorized isolated consumer target. |
| MIG-G10 | Initial publication and table-inventory changes in successor phased profiles. |
| MIG-G11 | Combined drop/append scheduling with complete dependencies and command correspondence. |

## References

- [Migration ownership and finite expression design](../02-design/solution-designs/SD-007-schema-migrations.md#mig-g02--typed-same-row-backfills-selected-2026-10-23)
- [Declaration and execution contract](../02-design/contracts/CONTRACT-081-table-lifecycle.md)
- [Native acceptance plan](../03-test/test-plans/STP-085-typed-actions-on-raw-tables.md)
- [Lifecycle operator guide](../04-build/guides/legal-table-lifecycle.md)
- [Wheel mirror guide](../04-build/guides/python-wheel-mirror.md)
- [Earlier backfill candidate evidence](sdk-release-notes-0.5.6.md)
- [Published Core 0.10.1 dependency](https://github.com/DocumentDrivenDX/umf/releases/tag/umf-v0.5.6)
- [Core producer and payload comparison](../04-build/evidence/mig-g02/final-integration/core-reuse-comparison.json) and [independent root comparison](../04-build/evidence/mig-g02/final-integration/core-reuse-root-review.json)
- [Design reviewer Core reuse signoff](../04-build/evidence/mig-g02/final-integration/core-reuse-independent-review.json)
- [Published Weft 0.4.53 dependency](https://github.com/DocumentDrivenDX/weft/releases/tag/v0.4.53)
