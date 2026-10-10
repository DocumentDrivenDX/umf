---
ddx:
  id: STP-057
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-057
      kind: informed_by
    - id: TD-057
      kind: informed_by
    - id: SD-008
      kind: informed_by
---

# STP-057: security-lifecycle

## Story Reference

**User Story:** [[US-057]] **Technical Design:** [[TD-057]]
**Solution Design:** [[SD-008]] **Project Test Plan:** TP-001.

## Scope and Objective

All P0 criteria in this story must have exercising evidence. The machine-readable
case inventory is `../security/cases.json`; plans are not passing executions.
Spikes supply qualified feasibility evidence only. No deferred or missing native
case can be represented as a pass.

## Acceptance Criteria Test Mapping

| AC ID | Named tests | Asserted behavior | Citation | Primary layer |
| --- | --- | --- | --- | --- |
| US-057-AC1 | pg-raw.L01, pg-raw.L02, truss.L01, truss.L02, delta-raw.L01, delta-raw.L02, ashlar.L01, ashlar.L02 | Create/delete/update and ownership-change action compare original/proposed state; failed checks leave no effects. | `@covers US-057-AC1` required in exercising test | native integration |
| US-057-AC2 | pg-raw.L03, pg-raw.L04, truss.L03, truss.L04, delta-raw.L03, delta-raw.L04, ashlar.L03, ashlar.L04 | Hold admitted operation at final release; revoker blocks until drain and acknowledges only after release. | `@covers US-057-AC2` required in exercising test | native integration |
| US-057-AC3 | pg-raw.L05, pg-raw.L06, pg-raw.L13, truss.L05, truss.L06, truss.L13, delta-raw.L05, delta-raw.L06, delta-raw.L13, ashlar.L05, ashlar.L06, ashlar.L13 | After assignment/grant removal acknowledges, a newly admitted read returns no revoked resources. | `@covers US-057-AC3` required in exercising test | native integration |
| US-057-AC4 | pg-raw.L07, pg-raw.L08, truss.L07, truss.L08, delta-raw.L07, delta-raw.L08, ashlar.L07, ashlar.L08 | Historical owner differs from current owner or key reused; current assignment with retained original owner alone governs. | `@covers US-057-AC4` required in exercising test | native integration |
| US-057-AC5 | pg-raw.L09, truss.L09, delta-raw.L09, ashlar.L09 | Change caller/query/policy/assignment/mapping/data cut; old cursor or cache token cannot bypass fresh admission. | `@covers US-057-AC5` required in exercising test | native integration |
| US-057-AC6 | pg-raw.L10, truss.L10, delta-raw.L10, ashlar.L10 | Serving copies, journals, tombstones, provenance, exports and feed checkpoints preserve declared policy and completeness. | `@covers US-057-AC6` required in exercising test | native integration |
| US-057-AC7 | pg-raw.L11, pg-raw.L14, truss.L11, truss.L14, delta-raw.L11, delta-raw.L14, ashlar.L11, ashlar.L14 | Delete retained owner or make guard/fact provider unavailable; refuse without hidden counts or effects. | `@covers US-057-AC7` required in exercising test | native integration |
| US-057-AC8 | pg-raw.L12, truss.L12, delta-raw.L12, ashlar.L12 | Fail policy/mapping migration midway; prior protection survives, and downgrade never broadens ordinary access. | `@covers US-057-AC8` required in exercising test | native integration |

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
