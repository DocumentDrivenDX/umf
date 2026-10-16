---
ddx:
  id: STP-903
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-903
      kind: informed_by
    - id: TD-903
      kind: informed_by
    - id: SD-900
      kind: informed_by
    - id: CONTRACT-902
      kind: informed_by
    - id: CONTRACT-903
      kind: informed_by
    - id: CONTRACT-904
      kind: informed_by
---

# STP-903: Inspect frozen work and bulk replay requirements

## Story Reference

[US-903](../../01-frame/user-stories/US-903-frozen-action-manifests.md), [TD-903](../../02-design/technical-designs/TD-903-frozen-action-manifests.md), SD-900.

## Scope and Objective

Prove US-903's original portable or native outcomes under its contracted profile. All rows are planned; no existing historical pass is allocated to new criteria.

## Acceptance Criteria Test Mapping

| Criterion | Planned test | Asserted behavior | Canonical citation | Layer | Planned file |
| --- | --- | --- | --- | --- | --- |
| US-903-AC1 | `complete_partition` | only the full-first [2,1] partition and exact constants/frames/identities are admitted; the underfilled [1,2] partition and missing/extra/duplicate work refuse. | `@covers US-903-AC1` | portable-contract | `tests/actions-manifest.test.ts` |
| US-903-AC2 | `artifact_integrity` | actual UTF-8 digests and scope are checked while original bytes remain retained; no canonical reserialization may rewrite queued intent. | `@covers US-903-AC2` | portable-contract | `tests/actions-manifest.test.ts` |
| US-903-AC3 | `empty_and_limits` | empty batches accompany empty items, exact finite boundaries are enforced and overflow yields no eligible partial work. | `@covers US-903-AC3` | portable-contract | `tests/actions-manifest.test.ts` |
| US-903-AC4 | `no_false_attestation` | snapshot completeness, native guard issuance, current authorization and atomic replay remain separate unverified obligations; portable inspection cannot seal or execute. | `@covers US-903-AC4` | portable-contract | `tests/actions-manifest.test.ts` |
| US-903-AC5 | `bulk_outcome_shape` | complete unions preserve immutable original control results and native/business uncertainty without later-state reconstruction or fresh-token permission. | `@covers US-903-AC5` | portable-contract | `tests/actions-manifest.test.ts` |
| US-903-AC6 | `manifest_browser_parity` | each agrees with the independent oracle; identical shared-implementation output alone is insufficient. | `@covers US-903-AC6` | portable-contract | `tests/actions-manifest.test.ts` |
| US-903-AC7 | `pure_construction` | original plan/receipt correspondence, complete invocation derivation and pre-serialization limits without native authority | `@covers US-903-AC7` | portable-contract | `tests/actions-manifest-construction.test.ts` |
| US-903-AC8 | `local_companion` | exact local bundle, native/mixed/unknown refusal and separate custody claims | `@covers US-903-AC8` | portable-contract | `tests/actions-local-profile.test.ts` |

## Executable Proof

Primary planned command: `bun test tests/actions-manifest.test.ts`. Create the target before feature implementation; every test must cite its allocated AC and be capable of failing. Record results under `docs/helix/04-build/evidence/bulk-update/`, with actual source/profile/runtime versions, original owner hashes, negative controls and explicit residuals. Actual Chromium is required for the browser rows; pure/static checks cannot substitute for native or browser outcomes.

## Data and Setup

Original fixture owner/path: UMF `docs/helix/03-test/fixtures/bulk-update/cases.json` and `model.json`, owned by US-902; all consumers pin the originals. Shared language-neutral fixture: three matching Customer identities2/10/11, active true, integer last_seen below100, fourth identity12 above100; batchSize2 yields [2,1]; registered set-active recipe plus original model/action/source/selection pins. Negative controls mutate one pinned input/guard/fence/permission at a time. Runtime rows require isolated owned databases/roles and current source/installer closure; synthetic issuers cannot qualify protected ordinary-person admission.

## Edge Cases and Failure Modes

Empty/no-op, exact bound/overflow, Unicode/large-integer, duplicate/unknown fields, tampering, missing authority, drift and uncertainty must keep their distinct contract outcomes. Native concurrency controls use actual two-connection barriers and independent effect/outcome queries.

## Build Handoff

US-902; native snapshot/guard/batch evidence belongs to Truss US-046–048. Create red tests first; implement the contracted boundary; then independently qualify effects/refusals and source correspondence. Done requires every allocated AC's executed cited test and expected outcome, current upstream pins and complete applicable dependency evidence. This plan allocates tests; it does not report executed coverage.

Independent consumer owner: UMF US-903, planned tests/actions-manifest-oracle.py; command `python3 tests/actions-manifest-oracle.py`. Its independent hand-coded partition/token/state evaluator checks exact owner-authored expected cases, separately from shared Bun/Chromium inspection.

## Initial implementation execution

Allocated tests now execute in `tests/actions-manifest.test.ts`; `tests/actions-manifest-corpus.ts` supplies hand-authored expected controls. `scripts/actions-manifest-browser.ts` imports the actual built public SDK in Chromium, while `tests/actions-manifest-oracle.py` independently consumes owner fixtures without importing UMF JS. [Execution evidence](../../04-build/evidence/bulk-update/us903-implementation.md) records current results and residual native gates.

## Pure construction acceptance slice — US-903-AC7

Run tests/actions-manifest-construction.test.ts against the public library and scripts/actions-manifest-construction-browser.ts against built ESM in actual Chromium. The independent expected output checks exact original plan bytes, unchanged core Key receipts, retained native order, complete action inputs, ordered frame versions and the full-first partition. Refuse receipt/source/tuple/guard substitution, unknown members, duplicate work, bounds and getters; empty work yields no fabricated invocation. Semantically equal numeric Key spellings must pass the original tuple codec while both spellings remain retained. Charge expanded output bytes before canonical serialization. Native selection completeness/order, current authorization, guard issuance, seal/recovery/queue/effects are not qualified by these portable tests.

## Browser-local profiles — US-903-AC8

tests/actions-local-profile.test.ts and actual Chromium controls verify original native preparation remains unchanged, exact local pair syntax/resources/invocation, unknown/mixed pair refusal, separate bulk.localOwner vs bulk.principal, original Key/manifest construction and no authority from compatible claims. Native PGlite/Truss/Weft and storage recovery qualification is separately mandatory under CONTRACT-905.
