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

This document remains a draft for an unreleased, unqualified SDK candidate. Its current dependency target is `umf_access` 0.1.0.dev8, `umf_codegen` 0.1.0a5, `umf-core` distribution 0.10.3 (semantic Core 0.10.0), and `umf-weft` 0.4.55. The SDK imports `weft` and `weft_sql`; the selected wire profile is `weft-sql/0.2.0`. Core 0.10.3 was published from release merge `7d334dec45948953718bfacd3ed6dd199cadba79` (M); its retained producer source is `34a337b2d398b5ae33954cc250f6237bc1661c21` (P). These are distinct provenance identities.

The current SDK qualification target exercises actual Linux Python 3.11 and 3.14 runtimes and separately declares Mac artifact inputs. The retained Mac Python 3.11 arm64 artifact records macOS 15.7.9; it is not a fresh Mac runtime result. The `macosx_11_0` wheel minimum tag is a static packaging target; runtime verification on macOS 11.0 is not claimed. Mac Python 3.14 remains unqualified, and no new macOS CI is part of this profile. The historical four-real-runtime profile remains historical evidence and is not represented as this candidate’s current qualification.

## Changes and ownership

G02 uses `umf.table-operation/0.2` declarations and `umf.table-migration-options/0.4` / `umf.table-migration/0.4` plans. Historical operation 0.1 and migration profiles 0.1–0.3 retain their grammar and replay meaning. The closed expression subset supports same-row Fields, typed literals, coalesce, strict text concatenation, exact integer/finite-decimal addition, subtraction and multiplication, and conditional expressions with literal-only predicates. It excludes callbacks, joins, casts, ambient state, raw SQL and floating arithmetic.

The selected maintenance profile targets one existing table and one Field, with retained JSON predecessor and successor sources and at most 10,000 selected rows. For an existing optional Field it fills only NULL values and tightens nullability atomically, preserving present values, identity, type, default and facets. For an appended required Field it performs the reviewed atomic add/check/fill/default/tighten sequence; the future default follows the historical fill. A required append without a default is admitted only when retained create commands already supply the Field. Invalid or NULL results abort the phase. Public host errors retain SQLSTATE and bounded location information without exposing row details.

UMF owns migration meaning and plan construction; Weft owns operation admission, SQL lowering and the exact-value guard. The host owns approval, connection and target identity, catalog checks, writer fencing, execution limits, transaction effects and recovery. Package publication or portable planning evidence does not establish those host effects.

## Qualification evidence

| Evidence | Result | Limit |
| --- | --- | --- |
| Core 0.10.3 installed/public proof, run 40547321010; OIDC publisher run 40533286158 | Core’s selected Linux proof and public publication checks passed for the immutable 0.10.3 release | This qualifies the Core dependency’s stated package scope, not SDK 0.5.7 or migration behavior |
| Core retained Mac artifact | Python 3.11 arm64 artifact is recorded for macOS 15.7.9 | Historical artifact input only; no fresh Mac runtime qualification; Mac Python 3.14 is unqualified |
| Stage-A run 40556187661 | The exact accounted validator companion was source-reviewed and adopted | Artifact-only byte custody; the companion was not evaluated by this step |
| Metamodel run 40557699932 | The actual eleven-output metamodel family was source-reviewed and adopted | Source-output custody only; self-check and dependent action, Codegen and R3 generation were withheld at that checkpoint |
| SDK 0.5.7 integrated candidate | Not yet qualified | Normal pull-request checks, fresh SDK proof, full 18-package cohort, G02 native gate and remaining migration acceptance are open |

The published Weft 0.4.55 receipt covers Mac packaging and nine frozen refusal-response comparisons; it reports Linux packaging only and makes no positive-query or native PostgreSQL consumer claim. Its publication does not close SDK consumer admission. Likewise, prior portable and native receipts are tied to their recorded source checkpoints and do not qualify this current candidate.

## Required actions and remaining gates

Do not use this candidate as a production SDK release. SDK publication remains blocked until its current-source pull-request checks, generated-source closure, fresh Linux installed proof and required consumer/native evidence are accepted. The selected SDK profile has two Linux runtime cells plus Mac artifact inputs; it does not claim four current installed runtimes. The full 18-package cohort and G02 native acceptance remain open.

G03 and G04 retain their own boundaries. G03 portable discovery and plan construction for a selected future default do not prove PostgreSQL write behavior; its complete native campaign and compatible ordinary-operation cohort remain unqualified. G04 is a partial portable source slice for checked conversion planning; it does not prove row conversion, original capture or host authority. Conversion execution, dependency sequencing and native acceptance remain open. No support claim is made for G05–G11, managed consumers, additional backends, Praxis, initial publication or combined field replacement.

## Known Issues

- **G02:** The selected typed same-row profile remains subject to the open native gate and full 18-package installed cohort. Its stated expression, row and transaction limits do not imply broader migration support.
- **G03:** Future-default discovery and planning do not establish PostgreSQL write behavior. The complete native campaign and compatible selected-module ordinary-operation cohort remain unqualified. Weft 0.4.55 publisher evidence is packaging plus refusal comparisons; it contains no positive-query or native PostgreSQL consumer claim.
- **G04:** The candidate has a partial portable source slice for checked conversion planning. It does not prove row conversion, original capture or host authority. Conversion execution, dependency sequencing and native acceptance remain open; round-trip recovery and unsupported dependent objects remain refused.
- **Other workstreams:** No support claim is made for G05–G11, managed consumers, additional backends, Praxis, initial publication or combined field replacement. Each retains its own implementation and qualification boundary.

Use an already approved SDK and host profile until SDK publication and the required acceptance gates close.

## References

- [G02 design and ownership](../02-design/solution-designs/SD-007-schema-migrations.md)
- [Lifecycle contract](../02-design/contracts/CONTRACT-081-table-lifecycle.md)
- [Typed-actions technical design](../02-design/technical-designs/TD-085-typed-actions-on-raw-tables.md)
- [Typed-actions acceptance plan](../03-test/test-plans/STP-085-typed-actions-on-raw-tables.md)
- [Schema migration build plan](../04-build/schema-migration-plan.md)
- [Stage-A source-output adoption](../04-build/evidence/schema-migration-design-review/main-reconciliation-001/stage-a-40556187661/owner-result.json)
- [Metamodel source-output adoption](../04-build/evidence/schema-migration-design-review/main-reconciliation-001/sdk-057-metamodel-40557699932-adopted/owner-result.json)
- [Core 0.10.3 public proof and publication](../04-build/evidence/rust-migration/r6-python314-regex/core-0103-dependency-plan/public-release-40547321010/README.md)
- [Weft 0.4.55 publisher and compatibility receipt](../04-build/evidence/mig-g02-g03/main-reconciliation-001/umf-weft-0455-publisher-handoff/owner-result.json)

<!-- Historical PR48 checkpoint text. It described Core 0.10.1 and the 0.5.6 candidate; it is retained for provenance and is not current release or support evidence.
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
-->
