---
ddx:
  id: US-902
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-900
      kind: informed_by
    - id: umf.prd
      kind: informed_by
---

# US-902: Inspect and assess portable action plans

**Feature:** FEAT-900. **Feature Requirements:** PAP-UMF-01, PAP-UMF-03; ACT-01–12. **PRD Requirements:** PAP-UMF-01, PAP-UMF-03. **Priority:** First bulk UPDATE slice. **Status:** Draft.

## Story

As a Schema Integration Maintainer, I want to inspect a portable plan against its registered action and exact executor capabilities, so that I can share mutation intent without inventing another action language.

## Context

This is a bounded part of the owner-selected portable-action proof. Existing action/core meaning is authoritative; compilation, selection and native execution remain separate. Governing contracts are CONTRACT-900, CONTRACT-901, CONTRACT-902; upstream owner dependencies are pinned explicitly at build/admission.

## Walkthrough

1. Select the original model/action/plan and exact profiles.
2. Request this story's operation through its owned public boundary.
3. Inspect the retained result or source-qualified refusal.
4. Verify the appropriate portable or native evidence before claiming support.

## Acceptance Criteria

- [ ] **US-902-AC1** — Given exact original owner model/action bytes and explicitly supplied semantic Registry/context, when I inspect and prepare a plan model, then exact portable action pins, set effect, Field/input/frames and complete interpreted dependencies are checked with existing owner semantics, preserving installed callbacks; executor-local revisions are not portable identities and SQL cannot register an action.
- [ ] **US-902-AC2** — Given unknown plan/model content or malformed recognized members, when I inspect and round-trip it, then original bytes/content remain recoverable and relevant unknown meaning blocks eligibility with source-qualified diagnostics.
- [ ] **US-902-AC3** — Given exact capability profiles with defined claims/evidence and owner action obligations, when I assess one unchanged original plan using the explicit Registry/context, then each action/selection/manifest/bulk/guard/snapshot obligation is independently assessed; missing or unauthenticated evidence cannot imply execution verification.
- [ ] **US-902-AC4** — Given supported exact boolean/integer/string literals and incompatible optional/null/key-changing/handler inputs, when I inspect, then supported values preserve spelling and unsupported executable shapes refuse without coercion.
- [ ] **US-902-AC5** — Given the shared corpus, when Bun and actual Chromium inspect/assess it, then copied outputs and ordered diagnostics agree without native I/O, state evaluation or host globals.

- [ ] **US-902-AC6** — Given duplicate JSON members, unpaired surrogates, overflowing bytes/depth/nodes or a mutated owner preparation artifact, when inspection/preparation runs with an explicit Registry, then it refuses without partial eligible output and preserves the original input/callback registry.

- [ ] **US-902-AC7** — Given exact local-owner actor/policy/invocation declarations, preparation admits only the complete known bundle against original action semantics; mixed native/local, unknown versions and incomplete resources refuse, preserving native tx1 and historical sources.

## Edge Cases

Relevant unknown meaning and mismatched pins refuse; missing native evidence cannot be replaced by shape validity. Uncertain commits require original reconciliation. Empty/no-op work never fabricates business changes.

## Test Scenarios

| Scenario | Criterion | State/action | Expected result |
| --- | --- | --- | --- |
| registered_action | US-902-AC1 | Owner fixture cases keyed by this test name; exact named negative mutation and expected outcome in the shared corpus | exact registration pins, set effect, destination Field/input correspondence and frame coverage are checked using the existing action extension; SQL cannot register or authorize an action. |
| retain_unknown | US-902-AC2 | Owner fixture cases keyed by this test name; exact named negative mutation and expected outcome in the shared corpus | original bytes/content remain recoverable and relevant unknown meaning blocks eligibility with source-qualified diagnostics. |
| capability_assessment | US-902-AC3 | Owner fixture cases keyed by this test name; exact named negative mutation and expected outcome in the shared corpus | each required action/selection/manifest/bulk/guard obligation is assessed separately and missing or unqualified support cannot imply verified execution. |
| exact_values | US-902-AC4 | Owner fixture cases keyed by this test name; exact named negative mutation and expected outcome in the shared corpus | supported values preserve spelling and unsupported executable shapes refuse without coercion. |
| portable_boundary | US-902-AC5 | Owner fixture cases keyed by this test name; exact named negative mutation and expected outcome in the shared corpus | copied outputs and ordered diagnostics agree without native I/O, state evaluation or host globals. |

## Dependencies

Existing core0.8.0 and actions0.1.0 semantic APIs; no runtime executor dependency. Parent solution design SD-900; contracts CONTRACT-900, CONTRACT-901, CONTRACT-902.

## Out of Scope

Live predicates, nullable/null mutation semantics, computed assignments, joins, key edits, whole-job atomicity, external business effects, compensation and a second native backend. Historical acceptance totals do not include this story.

## Implementation evidence

The previous unmerged implementation is being replayed against current main. Current scoped results and native limitations are recorded in [US-902 evidence](../../04-build/evidence/bulk-update/us902-implementation.md). Earlier test totals and source pins are historical and do not qualify this integration or the live compiler demonstration.
