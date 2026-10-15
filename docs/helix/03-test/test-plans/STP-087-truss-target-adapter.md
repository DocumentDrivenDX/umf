---
ddx:
  id: STP-087
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-087
      kind: informed_by
    - id: TD-087
      kind: informed_by
---

# STP-087: Use the SDK against a Truss ontology

## Story Reference

**User Story:** [[US-087-truss-target-adapter]].
**Technical Design:** [[TD-087-truss-target-adapter]].
**Related Solution Design:** [[SD-031]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Allocate every US-087 criterion between the UMF-owned shared conformance suite
and the Truss-owned engine witnesses, so that a Truss adoption packet can reach
`qualified` only when both have passed for exact pins. UMF tests prove that the
suite detects wrong behavior; they never prove that Truss behaves correctly.

All tests, fixtures and commands in this plan are planned and **UNTESTED** until
created and executed. The citations below are required future test-source
annotations, not coverage.

## Acceptance Criteria Test Mapping

The UMF conformance cases live in `python/umf_access/conformance/` and carry the
citation. Truss runs them against `TrussTarget` with its own native fixtures,
and adds the engine witnesses named in the last column in the Truss repository.
Each witness result is referenced from the adoption packet's
`conformanceEvidence`.

| AC ID | Failing test to create | Asserted behavior | Required source citation | Engine-owned witness (Truss repository) |
| --- | --- | --- | --- | --- |
| US-087-AC1 | `truss_reads_use_truss_read_path` (conformance `reads.parity`, `reads.pin_mismatch`) | Rows equal the target's reference read on the same data; a mismatched binding version or catalog revision raises `NotCompiledForTarget`; a failed read is never an empty page. | `@covers US-087-AC1` | Read path equality with Truss's own read API; statement log shows only read-path statements for the adapter's connection |
| US-087-AC2 | `truss_action_admission_matches_native` (conformance `actions.admission`) | For each subject fixture the outcome kind and code equal the expected native outcome supplied by the engine fixture; refusals are never `Rejected` or `Committed`. | `@covers US-087-AC2` | Same four subjects through Truss's native client, including service-for-`person-required` and unenrolled writer refusals |
| US-087-AC3 | `truss_commit_parity_with_native_client` (conformance `actions.receipt`) | The `Committed` receipt equals the receipt the engine reports for that invocation. | `@covers US-087-AC3` | Twin isolated stores: entity state, journal entries, feed entries and ACK progress equal apart from store identity |
| US-087-AC4 | `truss_conflict_and_failure_classification` (conformance `actions.conflict`, `actions.precommit_fault`, `actions.commit_loss`) | Loser raises `ActionConflict`; pre-commit fault raises `ActionFailed` carrying the engine's classification, not `ActionConflict`, and leaves no effects; post-COMMIT loss raises `ActionIndeterminate`; the adapter sends each request once. | `@covers US-087-AC4` | Barrier-synchronized conflict, injected fault before COMMIT and dropped connection after COMMIT against a Truss store, with journal and feed checks |
| US-087-AC5 | `truss_idempotent_replay` (conformance `actions.replay`) | Equal keyed repeat returns the original outcome byte-equal and evaluates nothing; different input with the same key raises `ActionConflict` with the original engine code and retention classification, without inferring retention from key presence. | `@covers US-087-AC5` | No new journal or feed entry after replay; replay of a rejected outcome also returns the rejection |
| US-087-AC6 | `truss_bulk_manifest_parity` (conformance `bulk.seal_submit`, `bulk.control_recovery`) | Exact attempt/key API and complete original materialize/submit unions; seal inspection on success; refusal, conflict, ControlFailure and ControlUnknown preserved, including lost ACK before job reference. Original recovery returns the same retained result; no fresh key/attempt/seal/job and no SDK control writes or execute method. | `@covers US-087-AC6` | Twin-store original control parity; dropped ACK, TOKEN_REUSE, refused seal, known noncommit, unknown custody and recovery witnesses through protected Truss APIs |
| US-087-AC7 | `truss_lexical_spelling_refusal` (conformance `values.lexical_spelling`) | A write of a spelling-sensitive Field refuses with `LEXICAL_SPELLING_REQUIRED` before any engine call; a read of the same Field decodes. | `@covers US-087-AC7` | Truss value-definition fixtures for an exact decimal token and an offset-bearing timestamp; no admission attempt recorded |

## Executable Proof

UMF planned commands (none exist yet):

```sh
python -m pytest python/umf_access/tests/conformance_selftest/
python -m pytest python/umf_access/tests/build/test_truss_targets.py
python -m pytest python/umf_access/tests/test_adoption_packet.py
```

The self-test runs every conformance case against deliberately faulty fake
targets (for example one that reports lost commits as `Committed`, one that
retries, one that returns empty pages on failure) and must fail each one. The
packet test checks that `qualified` is refused while any case or witness lacks a
passing receipt.

Truss-owned commands are defined by the Truss adoption design and run in the
Truss repository; they are not UMF gates and cannot be marked passing from here.
Retain UMF results under `docs/helix/04-build/evidence/typed-persistence/`; the
adoption packet references Truss's own receipts by digest.

## Data and Setup

UMF: fake targets and a small model with one query, one action (with a declared
failure code and a role) and one bulk command over a string predicate. Truss:
owned isolated stores seeded identically, enrolled human and service subjects,
an unenrolled module writer, explicit role bindings, a feed consumer for ACK
checks, and value definitions with spelling-sensitive Fields. Identity
allocation in twin stores must be deterministic for parity.

## Edge Cases and Failure Modes

Changed Truss, Weft, binding or catalog pins (requalify), retired action
revision on replay, manifest conflict after sealing (job stops), Truss
admission unavailable (`ADOPTION_INCOMPLETE`), `ABSENT` returned for a
ColumnSet-bound Field (`ADOPTION_MISMATCH`), and Records with timestamp or binary
Fields, which stay unqualified until T-1. No witness may execute a live
mutation twice on one store to compare paths.

## Build Handoff

UMF builds and self-tests the suite first, then Truss catalog targets and the
packet checker. Truss implements the adapter and witnesses under its own design.
Every AC needs an exercising conformance assertion carrying its `@covers` tag and
a passing Truss witness. Adoption is `qualified` only for the exact pins in the
packet; reads may qualify before actions and bulk.

### Original protocol qualification

US-087-AC2 must refuse same-ID changed/retired source and mismatched issued revision before invocation. AC3 compares the full immutable original result (revision, changes, noOp, verification, receipt and protected-safe code), including a no-op. AC4 preserves original unknown outcome and recovery context. AC5 covers byte-equal rejection and success replay, pre-admission TOKEN_REUSE and engine-confirmed retained conflicts. AC6 includes complete control unions and original-attempt recovery before any job reference is known. Typed views may not discard original fields or newly understood extensions.
