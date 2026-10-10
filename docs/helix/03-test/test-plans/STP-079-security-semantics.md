---
ddx:
  id: STP-079
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-079
      kind: informed_by
    - id: TD-079
      kind: informed_by
    - id: SD-008
      kind: informed_by
---

# STP-079: security-semantics

## Story Reference

**User Story:** [[US-079]] **Technical Design:** [[TD-079]]
**Solution Design:** [[SD-008]] **Project Test Plan:** TP-001.

## Scope and Objective

All P0 criteria in this story must have exercising evidence. The machine-readable
case inventory is `../security/cases.json`; plans are not passing executions.
Spikes supply qualified feasibility evidence only. No deferred or missing native
case can be represented as a pass.

## Acceptance Criteria Test Mapping

| AC ID | Named tests | Asserted behavior | Citation | Primary layer |
| --- | --- | --- | --- | --- |
| US-079-AC1 | S01 | Resolve Staff/Project/Ownership/Assignment and require active Assignment to same owning Project. | `@covers US-079-AC1` required in exercising test | contract/browser |
| US-079-AC2 | S02 | Same labels in different documents never join; exact typed keys and Unicode remain distinct. | `@covers US-079-AC2` required in exercising test | contract/browser |
| US-079-AC3 | S03, S11 | Reject wrong endpoint role, undeclared action, boolean/string comparison, unknown operator and depth/node excess. | `@covers US-079-AC3` required in exercising test | contract/browser |
| US-079-AC4 | S04, S12 | Broad read permit plus false mandatory membership denies; forbid dominates all permits; rule permutation agrees. | `@covers US-079-AC4` required in exercising test | contract/browser |
| US-079-AC5 | S05 | Active same-Project allows; inactive, missing, sibling Client/Project denies; any/all and ownerless behavior explicit. | `@covers US-079-AC5` required in exercising test | contract/browser |
| US-079-AC6 | S06 | Missing/ambiguous subject, incomplete assignment inventory, stale cut or untrusted attribute refuses entire collection. | `@covers US-079-AC6` required in exercising test | contract/browser |
| US-079-AC7 | S07 | Null, absence, withheld, constant transform and output type survive encoding; false permits add no obligations; absent protected disposition refuses. | `@covers US-079-AC7` required in exercising test | contract/browser |
| US-079-AC8 | S08 | Predicate/order/group/join/aggregate uses disclosed representation or explicit original-use action; withheld use refuses. | `@covers US-079-AC8` required in exercising test | contract/browser |
| US-079-AC9 | S09 | Preserve unknown rules and native source byte content where promised; unknown security meaning blocks interpretation. | `@covers US-079-AC9` required in exercising test | contract/browser |
| US-079-AC10 | S10 | Same policy/facts/diagnostics and refusal outcomes in Bun and Chromium, no host globals or external requests. | `@covers US-079-AC10` required in exercising test | contract/browser |

## Executable Proof

Run `bun docs/helix/02-design/spikes/security/acceptance.ts` for the release gate.
It must reject missing commands, nonpassing evidence and incomplete coverage.
Per-backend procedures in `../security/` specify original-role execution and
scenario expansions. Named cases currently without commands are implementation
obligations, explicitly not executable proof. Formal and native spike receipts
are under `../../04-build/evidence/security/` with scope limits.

## Data and Setup

Use Clients/Projects/Staff ownership/assignment fixtures; duplicate labels,
reversed endpoints, null/absence, multiple owners, private bags, historical owner
changes and complete/incomplete fact cuts. Disposable native installations and
independent expected outcomes are mandatory. Do not reuse compiler predicates
as the expected-result oracle.

## Edge Cases and Failure Modes

Unknown security meaning refuses interpretation while preserving source.
Collection uncertainty refuses before output. False permits add no masks;
protected output without disposition refuses. Native inventory/authority drift
invalidates prior evidence. Old snapshots cannot adopt new authority generations.

## Build Handoff

1. Implement declared typed contract and independent oracle tests.
2. Bind exact native profiles and execute positive/bypass controls.
3. Exercise lifecycle barriers and publish source-qualified evidence.
4. Require 100% P0 cases and stable AC citations before story acceptance.

Done requires actual assertions, matching command/source receipts and no skipped
required cases. Compiler/native profile gaps remain open rather than assumed.
