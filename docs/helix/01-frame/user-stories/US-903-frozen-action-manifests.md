---
ddx:
  id: US-903
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

# US-903: Construct and inspect frozen work and bulk replay requirements

**Feature:** FEAT-900. **Feature Requirements:** PAP-UMF-02, PAP-UMF-04. **PRD Requirements:** PAP-UMF-02, PAP-UMF-04. **Priority:** First bulk UPDATE slice. **Status:** Draft.

## Story

As a Schema Integration Maintainer, I want to construct and inspect immutable selected work and its required batch/recovery guarantees, so that queued work can be reviewed without mistaking a digest for execution evidence.

## Context

This is a bounded part of the owner-selected portable-action proof. Existing action/core meaning is authoritative; compilation, selection and native execution remain separate. Governing contracts are CONTRACT-902, CONTRACT-903, CONTRACT-904; upstream owner dependencies are pinned explicitly at build/admission.

## Walkthrough

1. Select the original model/action/plan and exact profiles.
2. Request this story's operation through its owned public boundary.
3. Inspect the retained result or source-qualified refusal.
4. Verify the appropriate portable or native evidence before claiming support.

## Acceptance Criteria

- [ ] **US-903-AC1** — Given a retained plan and manifest with three items and batchSize2, when inspected, then only the full-first [2,1] partition and exact constants/frames/identities are admitted; the underfilled [1,2] partition and missing/extra/duplicate work refuse.
- [ ] **US-903-AC2** — Given whitespace-distinct, tampered or store/epoch-mismatched artifacts, when inspected, then actual UTF-8 digests and scope are checked while original bytes remain retained; no canonical reserialization may rewrite queued intent.
- [ ] **US-903-AC3** — Given empty work and boundary/overflow cases, when inspected, then empty batches accompany empty items, exact finite boundaries are enforced and overflow yields no eligible partial work.
- [ ] **US-903-AC4** — Given a schema-valid client manifest, when assessed, then snapshot completeness, native guard issuance, current authorization and atomic replay remain separate unverified obligations; portable inspection cannot seal or execute.
- [ ] **US-903-AC5** — Given every bulk/control result including submit conflict/refusal, known control noncommit, lost seal/submit/claim/cancel/reconcile acknowledgement and recovered original sampled state, when outcome schemas validate, then complete unions preserve immutable original control results and native/business uncertainty without later-state reconstruction or fresh-token permission.
- [ ] **US-903-AC6** — Given owner-authored portable manifest/bulk fixtures and independent expected outcomes, when Bun/Chromium inspection and the separately coded Python test consumer run, then each agrees with the independent oracle; identical shared-implementation output alone is insufficient.

- [ ] **US-903-AC7** — Given exact original plan bytes, resolved-action and snapshot basis declarations, ordered selected entity/guard rows and their original core Key tuple receipts, construction verifies every receipt against the pinned model, derives all action inputs/frame versions and deterministic batches, and returns an unsealed Artifact or atomically refuses. Receipt source/identity/value/bytes substitution, unknown members, duplicate work, overflow and malformed input refuse; no native selection, ordering, authorization or seal is attested.

- [ ] **US-903-AC8** — Given native or local-owner invocation intent, portable manifest construction retains the exact original profile/pins and assessment selects the corresponding exact bulk companion/claims; native delegated-human and local-owner claims cannot substitute and execution remains unverified.

## Edge Cases

Relevant unknown meaning and mismatched pins refuse; missing native evidence cannot be replaced by shape validity. Uncertain commits require original reconciliation. Empty/no-op work never fabricates business changes.

## Test Scenarios

| Scenario | Criterion | State/action | Expected result |
| --- | --- | --- | --- |
| complete_partition | US-903-AC1 | Owner fixture cases keyed by this test name; exact named negative mutation and expected outcome in the shared corpus | consecutive ordinals, unique target guards, complete expected frames/constant inputs and the exact contiguous bounded partition are checked; missing/extra/duplicate work refuses. |
| artifact_integrity | US-903-AC2 | Owner fixture cases keyed by this test name; exact named negative mutation and expected outcome in the shared corpus | actual UTF-8 digests and scope are checked while original bytes remain retained; no canonical reserialization may rewrite queued intent. |
| empty_and_limits | US-903-AC3 | Owner fixture cases keyed by this test name; exact named negative mutation and expected outcome in the shared corpus | empty batches accompany empty items, exact finite boundaries are enforced and overflow yields no eligible partial work. |
| no_false_attestation | US-903-AC4 | Owner fixture cases keyed by this test name; exact named negative mutation and expected outcome in the shared corpus | snapshot completeness, native guard issuance, current authorization and atomic replay remain separate unverified obligations; portable inspection cannot seal or execute. |
| bulk_outcome_shape | US-903-AC5 | Owner fixture cases keyed by this test name; exact named negative mutation and expected outcome in the shared corpus | terminal batch vectors/control prefixes retain original meaning and uncertainty is never treated as failed rollback or fresh-token permission. |
| manifest_browser_parity | US-903-AC6 | Owner fixture cases keyed by this test name; exact named negative mutation and expected outcome in the shared corpus | retained bytes and exact diagnostics agree and a second independently coded test consumer accepts or explicitly refuses unchanged intent. |

## Dependencies

US-902; native snapshot/guard/batch evidence belongs to Truss US-046–048. Parent solution design SD-900; contracts CONTRACT-902, CONTRACT-903, CONTRACT-904.

## Out of Scope

Live predicates, nullable/null mutation semantics, computed assignments, joins, key edits, whole-job atomicity, external business effects, compensation and a second native backend. Historical acceptance totals do not include this story.

## Implementation evidence

The previous unmerged validators and independent Python consumer are being replayed against current main alongside the new constructor. [US-903 evidence](../../04-build/evidence/bulk-update/us903-implementation.md) records current scoped checks and native limitations. Earlier source/test totals are historical; no native execution or release acceptance is claimed.

