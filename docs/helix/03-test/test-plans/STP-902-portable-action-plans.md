---
ddx:
  id: STP-902
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-902
      kind: informed_by
    - id: TD-902
      kind: informed_by
    - id: SD-900
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: CONTRACT-901
      kind: informed_by
    - id: CONTRACT-902
      kind: informed_by
---

# STP-902: Inspect and assess portable action plans

## Story Reference

[US-902](../../01-frame/user-stories/US-902-portable-action-plans.md), [TD-902](../../02-design/technical-designs/TD-902-portable-action-plans.md), SD-900.

## Scope and Objective

Prove US-902's original portable or native outcomes under its contracted profile. All rows are planned; no existing historical pass is allocated to new criteria.

## Acceptance Criteria Test Mapping

| Criterion | Planned test | Asserted behavior | Canonical citation | Layer | Planned file |
| --- | --- | --- | --- | --- | --- |
| US-902-AC1 | `registered_action` | exact portable action pins, set effect, Field/input/frames and complete interpreted dependencies are checked with existing owner semantics, preserving installed callbacks; executor-local revisions are not portable identities and SQL cannot register an action. | `@covers US-902-AC1` | portable-contract | `tests/actions-plan.test.ts` |
| US-902-AC2 | `retain_unknown` | original bytes/content remain recoverable and relevant unknown meaning blocks eligibility with source-qualified diagnostics. | `@covers US-902-AC2` | portable-contract | `tests/actions-plan.test.ts` |
| US-902-AC3 | `capability_assessment` | each action/selection/manifest/bulk/guard/snapshot obligation is independently assessed; missing or unauthenticated evidence cannot imply execution verification. | `@covers US-902-AC3` | portable-contract | `tests/actions-plan.test.ts` |
| US-902-AC4 | `exact_values` | supported values preserve spelling and unsupported executable shapes refuse without coercion. | `@covers US-902-AC4` | portable-contract | `tests/actions-plan.test.ts` |
| US-902-AC5 | `portable_boundary` | copied outputs and ordered diagnostics agree without native I/O, state evaluation or host globals. | `@covers US-902-AC5` | portable-contract | `tests/actions-plan.test.ts` |
| US-902-AC6 | `strict_json_bounds` | it refuses without partial eligible output and preserves the original input/callback registry. | `@covers US-902-AC6` | portable-contract | `tests/actions-plan.test.ts` |

## Executable Proof

Primary planned command: `bun test tests/actions-plan.test.ts`. Create the target before feature implementation; every test must cite its allocated AC and be capable of failing. Record results under `docs/helix/04-build/evidence/bulk-update/`, with actual source/profile/runtime versions, original owner hashes, negative controls and explicit residuals. Actual Chromium is required for the browser rows; pure/static checks cannot substitute for native or browser outcomes.

## Data and Setup

Original fixture owner/path: UMF `docs/helix/03-test/fixtures/bulk-update/cases.json` and `model.json`, owned by US-902; all consumers pin the originals. Shared language-neutral fixture: three matching Customer identities2/10/11, active true, integer last_seen below100, fourth identity12 above100; batchSize2 yields [2,1]; registered set-active recipe plus original model/action/source/selection pins. Negative controls mutate one pinned input/guard/fence/permission at a time. Runtime rows require isolated owned databases/roles and current source/installer closure; synthetic issuers cannot qualify protected ordinary-person admission.

## Edge Cases and Failure Modes

Empty/no-op, exact bound/overflow, Unicode/large-integer, duplicate/unknown fields, tampering, missing authority, drift and uncertainty must keep their distinct contract outcomes. Native concurrency controls use actual two-connection barriers and independent effect/outcome queries.

## Build Handoff

Existing core0.8.0 and actions0.1.0 semantic APIs; no runtime executor dependency. Create red tests first; implement the contracted boundary; then independently qualify effects/refusals and source correspondence. Done requires every allocated AC's executed cited test and expected outcome, current upstream pins and complete applicable dependency evidence. This plan allocates tests; it does not report executed coverage.

## Initial implementation execution

The original planned test mapping now has executable controls in `tests/actions-plan.test.ts` and the shared `tests/actions-plan-corpus.ts`. Actual Chromium imports the built public ESM through `scripts/actions-plan-browser.ts`. See [implementation evidence](../../04-build/evidence/bulk-update/us902-implementation.md) and [browser receipt](../../04-build/evidence/bulk-update/us902-browser.json). This is portable declaration evidence; native and downstream gates remain open.
