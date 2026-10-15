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

**User Story:** [[US-079-security-semantics]] **Technical Design:** [[TD-079-security-semantics]]
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

### Field-protection allocation — 2026-10-15 UTC

These are required semantic cases under accepted FEAT-008 SEC-13..15 and
CONTRACT-062/063. Every case also exercises US-079-AC10 in real Chromium.
All 13 are `not-run`, without runner bindings; this allocation supplies no pass.

| Case | Criteria | Required independent assertion |
| --- | --- | --- |
| S13 | US-079-AC11, US-079-AC12 | Resolve exact pinned catalog/transform/version and qualified input/output Field domains; foreign or missing references refuse. |
| S14 | US-079-AC11, US-079-AC3, US-079-AC9 | Preserve unknown catalog/version/kind/member and native source content through JSON/YAML; unknown meaning blocks interpretation. |
| S15 | US-079-AC12 | Additive security0.1-to0.2 migration preserves legacy constant meaning; rollback refuses any non-constant reference without changing the source. |
| S16 | US-079-AC13, US-079-AC8 | Join/group require retained equality and order requires retained order; deterministic transforms report implied equality even if omitted from authored properties. |
| S17 | US-079-AC13 | Random tokenization cannot admit disclosed equality join/group; a weakened validator ignoring that dependency must be distinguished. |
| S18 | US-079-AC11, US-079-AC3 | Catalogs over256 transforms, more than32 typed parameters or literals exceeding4096 UTF-16 units refuse bounded interpretation rather than trimming. |
| S19 | US-079-AC14 | Constant, partial/fixed redaction and generalization exact outputs match independently authored Python expectations; keyed/vault operations are not executed by UMF. |
| S20 | US-079-AC14, US-079-AC7 | Canonical null, absence, withheld, transformed null, changed output domain and stored token survive disposition transport distinctly. |
| S21 | US-079-AC15, US-079-AC3 | Tokenize/encrypt and reversible declarations require explicit complete custody metadata; valid declarations remain unverified native obligations. |
| S22 | US-079-AC15 | Reverse action is distinct from read/field/original-authorized actions; ordinary/original disposition exposes stored token and never implies plaintext recovery. |
| S23 | US-079-AC15 | History, snapshots, exports, feeds and caches each have explicit propagation declarations; missing or unknown required meaning refuses and source is preserved. |
| S24 | US-079-AC16 | Field mutation without original disposition or explicit field-bound blind-write permission refuses, including a proposed value equal to the mask output. |
| S25 | US-079-AC16, US-079-AC15 | Stored-transformed field mutation additionally requires the exact declared vault-write action; unrelated read/original/reverse permissions cannot substitute. |

Implement real failing assertions and independent oracle expectations before
implementing each slice. Register exact commands, sources and assertion IDs in
`cases.json` only when those exercising runners exist. Missing APIs, partial
closure or unavailable native custody cannot be replaced by a passing placeholder.
No native US-056/057 obligation is discharged by a semantic case.

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


### Identity transport closure controls — 2026-10-11

For US-079 AC3/AC10 prerequisites, preserve separate policy reads versus extra
instance keys; preserve original compound-key and endpoint role/component order;
exclude unused ontology records; include identity/endpoints even for literal
association conditions; refuse unknown meaning without source mutation; reach
endpoint identities for association resource targets and nested association targets.
Eight new unit controls plus three dependency/write regressions pass in the final
owner packet, with six checks replayed through the exported browser bundle. This
qualifies metadata derivation only. Native mapping/decoding, trusted completeness,
authenticated subject/current authority and final disclosure still need evidence.
