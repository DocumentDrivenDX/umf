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

## Release Scope

This draft describes a candidate, not an SDK release. The intended release cohort is `umf_access` 0.1.0.dev8, `umf_codegen` 0.1.0a5, Weft 0.4.53, and Core distribution 0.10.2 with semantic Core 0.10.0. The candidate includes the bounded G02 typed same-row migration path, implemented portable G03 future-default planning, and a partial portable G04 checked-conversion slice. The profiles and remaining gates below distinguish implemented source and portable evidence from native qualification. No SDK release, merge, native acceptance, or managed-consumer acceptance is claimed.

## Changes and Ownership

G02 uses `umf.table-operation/0.2` declarations and `umf.table-migration-options/0.4` / `umf.table-migration/0.4` plans. Historical operation 0.1 and migration profiles 0.1–0.3 retain their grammar and replay meaning. The closed expression subset supports same-row Fields, typed literals, coalesce, strict text concatenation, exact integer/finite-decimal addition, subtraction and multiplication, and conditional expressions with literal-only predicates. It excludes callbacks, joins, casts, ambient state, raw SQL and floating arithmetic.

The selected maintenance profile targets one existing table and one Field, with retained JSON predecessor and successor sources and at most 10,000 selected rows. For an existing optional Field it fills only NULL values and tightens nullability atomically, preserving present values, identity, type, default and facets. For an appended required Field it performs the reviewed atomic add/check/fill/default/tighten sequence; the future default follows the historical fill. A required append without a default is admitted only when retained create commands already supply the Field. Invalid or NULL results abort the phase. Public host errors retain SQLSTATE and bounded location information without exposing row details.

UMF owns migration meaning and plan construction; Weft owns operation admission, SQL lowering and the exact-value guard. The host owns approval, connection and target identity, catalog checks, writer fencing, execution limits, transaction effects and recovery. This portable evidence does not establish those host effects.

## Qualification Evidence

| Evidence | Result | Limit |
| --- | --- | --- |
| Portable run 40340243356, source checkpoint `338f476a` | TypeScript gates, API and migration controls, and 156 Chromium cases passed | Portable/browser evidence for that checkpoint; no native execution claim |
| Native campaign 40270912993 | `g03-domains` exceeded its 180-second command bound; no complete campaign result was produced | Native acceptance remains open |
| Core public Linux run 40371456196 | 254 tests passed for Core distribution 0.10.2 | Core package verification only; Mac and PyPI checks were queued at capture |

The SDK 0.5.7 version change, Core 0.10.2 dependency-pin adoption and current-main reconciliation remain open. The original four-cell installed/offline SDK adoption matrix remains open, separately from the selected native campaign. GitHub immutable-release enforcement is disabled; no locked-release claim is made.

## Known Issues

- **G03:** Portable discovery and plan construction for one existing stored Field’s future default are implemented under discovery 0.2, options/plan 0.5 and execution profile 0.4. The selected subset supports SET, replacement and DROP, distinguishing an absent native default from an explicit literal NULL (nullable Fields only), omission from explicit NULL, and future defaults from historical fill. These source and compiler controls passed the recorded portable gate; this does not prove PostgreSQL write behavior. The complete native campaign and compatible selected-module ordinary-operation cohort remain unqualified. Published Weft 0.4.53 does not by itself close that compatibility gate.
- **G04:** The candidate implements a partial source-bound portable slice: discovery 0.4, options/plan 0.7 and execution profile 0.6 validate closed conversion selections and construct typed capture-originals / convert-field / validate-conversion steps in a required transaction phase. Retained-originals and explicitly reviewed irreversible recovery choices have portable controls; plans remain `nativeQualified: false`. This is not evidence that actual rows were converted, originals captured or restored, or host authority exercised. Round-trip recovery is refused in this slice, as are conversion targets with defaults or unsupported dependent indexes, constraints, keys, policies or operations. Full recipe execution, dependency sequencing and native acceptance remain open; narrowing, cross-family conversion and shadow rewrites have no qualified native support claim here.
- **Other workstreams:** This G02 native selection does not qualify retirement/purge, online backfills, coordinated stores, other backends, managed consumers, initial table publication or combined field replacement. Existing candidate portable implementations and evidence must be assessed under their own profiles; this is not a claim that all such implementation is absent. In particular, G10 and G11 native support does not follow from the G02 profile.

This candidate is not qualified for production migration execution. Use an already approved SDK and host profile until the remaining release and acceptance gates close.

## References

- [G02 design and ownership](../02-design/solution-designs/SD-007-schema-migrations.md)
- [Lifecycle contract](../02-design/contracts/CONTRACT-081-table-lifecycle.md)
- [Typed-actions technical design](../02-design/technical-designs/TD-085-typed-actions-on-raw-tables.md)
- [Typed-actions acceptance plan](../03-test/test-plans/STP-085-typed-actions-on-raw-tables.md)
- [Schema migration build plan](../04-build/schema-migration-plan.md)
- [Portable run 40340243356](../04-build/evidence/schema-migration-design-review/combined-portable-pass-40340243356/owner-result.json)
- [Native campaign 40270912993](../04-build/evidence/mig-g02-g03/native-final-40270912993/owner-result.json)
- [Core public Linux verification 40371456196](../04-build/evidence/schema-migration-design-review/main-reconciliation-001/core-public-linux-40371456196/README.md)
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
