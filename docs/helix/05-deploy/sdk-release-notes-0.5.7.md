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
