---
ddx:
  id: STP-905
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-905
      kind: derived_from
    - id: TD-905
      kind: informed_by
    - id: CONTRACT-908
      kind: references
---

# STP-905: saga recovery conformance

## Story Reference

**User Story:** [[US-905-saga-recovery-conformance]]
**Technical Design:** [[TD-905-saga-recovery-conformance]]
**Solution Design:** [SD-901](../../02-design/solution-designs/SD-901-saga-semantics.md)
**Project Test Plan:** [TP-001](../test-plan.md).

## Scope and Objective

Prove the selected story against CONTRACT-908. Every row below is a planned
implementation test, not a completion claim. Existing structural/TLC evidence
supports only its recorded subset. No product semantic, browser or native case
is marked passed merely because a model or proposal schema passed.

**Blocking gate:** all story rows need source with canonical citations,
independent expected outcomes and recorded results before implementation completion.
Native execution requires isolated coordinator and two provider stores, original effect/outcome custody, current authority and independent observer access.

## Acceptance Criteria Test Mapping

| AC ID | Planned test | Asserted behavior | Canonical citation | Level | Planned file |
| --- | --- | --- | --- | --- | --- |
| US-905-AC1 | `confirmed_success` (planned) | Retain original independently observed successful outcomes. | `@covers US-905-AC1` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC2 | `failed_allocation_then_release` (planned) | Retain reserve, rejection and release as separate original results. | `@covers US-905-AC2` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC3 | `reverse_multi_step_unwind` (planned) | Several committed steps compensate in reverse completion order using original outputs. | `@covers US-905-AC3` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC4 | `crash_after_provider_commit` (planned) | Recover original invocation after remote commit/local acknowledgement loss before dependent work. | `@covers US-905-AC4` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC5 | `unknown_provider_stays_blocked` (planned) | Unavailable authoritative lookup leaves uncertainty and blocks all later work. | `@covers US-905-AC5` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC6 | `redelivery_keeps_original_effect` (planned) | Duplicate delivery under qualified original key produces no extra provider effect. | `@covers US-905-AC6` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC7 | `unsafe_retry_refuses` (planned) | Unknown original lacking deduplication cannot start a fresh business attempt. | `@covers US-905-AC7` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC8 | `budget_exhaustion_retains_obligations` (planned) | Automatic work stops at count/time budget without inventing noncommit. | `@covers US-905-AC8` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC9 | `failed_compensation_stops_unwind` (planned) | A failed release blocks earlier compensation and retains remaining obligations. | `@covers US-905-AC9` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC10 | `compensation_acknowledgement_loss` (planned) | Reconcile original release after lost acknowledgement before redelivery. | `@covers US-905-AC10` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC11 | `cancel_ticket_race` (planned) | Cancel fences subsequent tickets; previously issued invocation is reconciled before unwind. | `@covers US-905-AC11` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC12 | `independent_compensation_authority` (planned) | Revoked forward grant does not grant release; denial retains intervention. | `@covers US-905-AC12` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC13 | `cross_tenant_history_and_controls` (planned) | Cross-scope references cannot read or change original custody. | `@covers US-905-AC13` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC14 | `retired_definition_and_original_custody` (planned) | Original interpretations remain pinned; unavailable custody blocks unsafe continuation. | `@covers US-905-AC14` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC15 | `superseded_worker_cannot_admit` (planned) | Old claimant cannot issue a new ticket or alter valid instance controls. | `@covers US-905-AC15` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC16 | `irreversible_effect_is_retained` (planned) | Delivered irreversible notification remains visible and prevents rollback claims. | `@covers US-905-AC16` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC17 | `nondeterministic_output_is_retained` (planned) | Restart uses the original retained output rather than rerunning an agent. | `@covers US-905-AC17` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC18 | `issuer_verified_manual_resolution` (planned) | Resolution imports only original issuer-proved outcome, appends attribution and never rewrites facts. | `@covers US-905-AC18` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC19 | `expired_identity_is_not_reused` (planned) | Expired original instance/submission identities cannot create new effects. | `@covers US-905-AC19` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC20 | `coordinator_self_report_is_unverified` (planned) | Histories without independent provider witnesses cannot qualify native execution. | `@covers US-905-AC20` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC21 | `submit_acknowledgement_loss` (planned) | Concurrent equal submit/retry returns one instance and original submitted response. | `@covers US-905-AC21` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC22 | `changed_intent_conflicts` (planned) | Changed revision/inputs/bindings conflict before and after completion; expiry preserves nonreuse. | `@covers US-905-AC22` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC23 | `definition_retirement_vs_active_instance` (planned) | New instances refuse; active instance can use active pinned action revisions. | `@covers US-905-AC23` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |
| US-905-AC24 | `retirement_between_ticket_and_native_admission` (planned) | Retired forward/compensation revision refuses fresh native admission; accepted transaction may finish; lookup survives. | `@covers US-905-AC24` (required in planned source) | Native + independent oracle | `tests/saga/native-recovery.py` |

## Executable Proof

The schema/example verifier is available at
`docs/helix/02-design/examples/saga/verify.py`; it validates structures and negative
shape controls only. The 18-case abstract coordination run and seven-case
admission-boundary run live under `02-design/experiments/saga`; their source/config
hashes must match. Neither test set closes any whole native or browser AC row.

### Planned Commands

`python3 tests/saga/native-recovery.py` and
`python3 tests/saga/history-oracle.py` must exercise the selected installed
consumer, original native custody and independent observer facts. Also require
`bun test tests/saga/protocol.test.ts` for closed transport unions.

These files/commands are build handoff targets and are not claimed to exist in
this design PR. Implementers must retain failures, exact versions and source
hashes with their observed results; fixture availability alone is not execution.

## Data and Setup

Use the fabricated equipment allocation Document and closed submit request in
`docs/helix/02-design/examples/saga/`. Include malformed known declarations,
relevant and unrelated unknown metadata, literal/Key/presence boundaries and
capacity overflows. Pin installed handler, action and provider profiles separately.

Add native fault cuts before/after control commit, ticket issue, provider
admission, provider effect/outcome commit and coordinator observation. Distinguish
original response replay from current status and test duplicate claim/cancel
control delivery as well as submit. Use independently authenticated initiator,
worker, compensation actor, outsider and read-only observer. Confirm originals
through native provider facts, not coordinator-generated success histories.

Retirement/cancellation fixtures include a ticket already issued but not yet
admitted by its provider. Test provider-bound result limit violation before
commit and host capacity reservation before ticket issue. Clock changes,
expired lease, partial control failures and unavailable evidence must never
invent noncommit. Test resolution with forged, contradictory and foreign evidence.

## Edge Cases and Failure Modes

Unknown interpretation, stale provider custody, oversize values and lost original
results refuse unsafe work while preserving source/outcome obligations. Reordering
an unordered display does not change authored step order. Missing observations
are not negative evidence. No unsupported external profile becomes eligible by
changing an inert handler name.

## Build Handoff

Implement the contract-owned pure interfaces first, then story-specific fixture
assertions and actual host/binding integration. Extend boundary checks and add
negative controls before claiming new source-family support. Require passing
per-AC results and exact installed versions for completion; retain untested
obligations as unverified. No production orchestrator or UI delivery is included.
