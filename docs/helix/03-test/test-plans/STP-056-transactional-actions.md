---
ddx:
  id: STP-056
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-056
      kind: informed_by
    - id: TD-056
      kind: informed_by
    - id: SD-008
      kind: informed_by
    - id: CONTRACT-053
      kind: references
---

# STP-056: Transactional reference action qualification

## Story Reference

[[US-056-transactional-actions]], [[TD-056-transactional-actions]],
[[SD-008-declarative-actions]] and TP-001.

## Scope and Objective

Prove the full bounded CONTRACT-053 consumer journey in an actual PostgreSQL store.
The rows below identify required current-source witnesses; execution status is recorded
in the certification evidence. A canonical citation establishes traceability, not a pass. Portable interpreter tests and prior SQL/TLC
probes are prerequisites, not these runtime witnesses. Production/downstream/cross-store
adoption remains outside this story.

## Acceptance Criteria Test Mapping

| Criterion | Test/file | Required assertions | Canonical citation | Layer / witness |
| --- | --- | --- | --- | --- |
| US-056-AC1 | `preview.test.ts`, `receipts.test.ts` and `composite-key.test.ts` in `tests/actions-reference/` | No handler, writes, terminal record or reservation; invoke revalidates changed state | `@covers US-056-AC1` | Native integration / EX-04 |
| US-056-AC2 | `executor.test.ts`, `create.test.ts`, `delete.test.ts`, `link-executor.test.ts`, `fresh-admission.test.ts`, `recipe.test.ts`, `composite-key.test.ts` and `native-refinement.test.ts` in `tests/actions-reference/` | Full-declaration unknown extra dependency/omitted optional input refusal; exact ordered create/set/delete/link/unlink verification; native constraints; changed-then-restored net no-op | `@covers US-056-AC2` | Native integration / EX-01/03 |
| US-056-AC3 | `executor.test.ts`, `recipe.test.ts`, `handler-executor.test.ts` and `lookup-horizon.test.ts` in `tests/actions-reference/` | Declared preconditions/concurrency order; durable terminal rejection; postcondition/evaluation failure rolls back | `@covers US-056-AC3` | Native integration / EX-02/03 |
| US-056-AC4 | `outcomes.test.ts`, `intent.test.ts`, `executor.test.ts`, `lookup-horizon.test.ts`, `composite-key.test.ts` and `native-refinement.test.ts` in `tests/actions-reference/` | Typed original intent equality, reordered version-assertion retry equality, duplicate/unknown frame refusal, changed payload conflict, service-independent namespace, tombstone/horizon and no execute-on-lookup | `@covers US-056-AC4` | Native integration / EX-02 |
| US-056-AC5 | `policy.test.ts`, `discovery.test.ts`, `admission.test.ts`, `recovery.test.ts`, `reader-revocation.test.ts` and `native-refinement.test.ts` in `tests/actions-reference/` | Independent family discovery and original-result policies; denied lookup cannot query token SQL with native restricted-role witness; changed-role, missing/tombstone and namespace privacy; two-session discovery/original revocation races and authorization before protected replay/preview; request identities cannot spoof issuer | `@covers US-056-AC5` | Native integration / EX-02 |
| US-056-AC6 | `revisions.test.ts`, `handler-executor.test.ts`, `evolution.test.ts` and `native-refinement.test.ts` in `tests/actions-reference/` | Immutable snapshot tokens; retired fresh refusal, pinned accepted work, original-schema retained replay and unavailable refusal | `@covers US-056-AC6` | Native integration / EX-02 |
| US-056-AC7 | `sandbox` in `tests/actions-reference/sandbox.test.ts`, `sandbox-security.test.ts` and `launch-owner.test.ts` | Raw DB/network/files/ambient capabilities absent; outside-frame and malformed RPC attempts abort before access; operation/time limits; native delayed CREATE/START, restart admission fence, original CID recovery, program snapshot and stale-owner refusal | `@covers US-056-AC7` | Native integration / EX-03 |
| US-056-AC8 | `store.test.ts`, `state.test.ts`, `graph.test.ts`, `creation-relationships.test.ts`, `link-executor.test.ts`, `composite-key.test.ts` and `invariant-mutants.test.ts` in `tests/actions-reference/` | Lossless NUL/lone-surrogate identities/payloads, maximum escaped issuer context and noncompressible tokens, large core tuples and forced lookup collisions; native primary/alternate aliases, shared resource stamps, link-only stamp changes, restored no-op versions, delete/use tracking, absent create races, phantom relationships and multiplicity | `@covers US-056-AC8` | Native integration / EX-03 |
| US-056-AC9 | `rollback` in `tests/actions-reference/recovery.test.ts`, `handler-executor.test.ts` and `process-recovery.test.ts` | Process death/postcondition/output errors leave no partial terminal/business writes; known transient retry <=3; exhausted rollback | `@covers US-056-AC9` | Native integration / EX-03 |
| US-056-AC10 | `reconciliation` in `tests/actions-reference/recovery.test.ts` and `process-recovery.test.ts` | Commit acknowledgement loss plus restart recovers one original terminal result; unknown commit never auto-retried with or without a key | `@covers US-056-AC10` | Native integration / EX-02 |
| US-056-AC11 | `audit` in `tests/actions-reference/audit.test.ts` and `attempts.test.ts` | Trusted principal/service/build/policy/correlation protected; business/outcome/audit/outbox atomic; no raw input leak; denial/rollback telemetry separate | `@covers US-056-AC11` | Native integration / EX-05 |
| US-056-AC12 | `projection.test.ts`, `restore.test.ts`, `receipts.test.ts`, `evolution.test.ts`, `reader-revocation.test.ts` and `invariant-mutants.test.ts` in `tests/actions-reference/` | Duplicate/reordered events do not advance incomplete prefix; content through receipt, wrong store/epoch, fenced uncertain restore, verified reconciliation or explicit qualified new namespace, horizon and evolution review discriminators; actual owned dump/restore, revoked authority, all-namespace fencing, linked genesis and corrupt alias/orientation refusal | `@covers US-056-AC12` | Native integration / EX-05 |

## Executable Proof

Primary command: `bun test --timeout 600000 tests/actions-reference`.
A host harness must start an isolated PostgreSQL 17.9 container, run `store.sql`,
verify its actual server version and clean up after all sessions complete.
The handler process uses a separately fingerprinted, network-disabled runtime.
Full core/action regression, schema audits and real Chromium remain separate gates.

## Data and Setup

Use admitted approve/create-link and composite-Key declarations with known roles.
Add alternate Keys, explicit read frames, version assertions, conditions and allowlisted
handler revisions. Association-Record, owned lifecycle and unqualified native refinements
must refuse as unsupported runtime cases. Fixtures use synthetic issuer credentials,
trusted membership and native seed state; no user credentials are required.

## Edge Cases and Failure Modes

Inject failures before SQL writes, between business and terminal writes, before commit,
and after successful commit before response. Observe native tables independently.
Use two real SQL sessions and barriers for contention; sleeps alone do not prove races.
Delete control checks in explicit mutants and prove their invalid histories are caught.

## Build Handoff

Follow TD-056 sequence. Preserve the exact declaration while admission fails closed.
All twelve criteria require current passing native evidence, canonical citations and
source/runtime fingerprints. Keep any environmental failure visible; no skips or
prototype substitutions satisfy this story. Final Astra review and independent formal
refinement/negative controls precede certification.
