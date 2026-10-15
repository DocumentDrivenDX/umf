---
ddx:
  id: US-087
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-031
      kind: informed_by
---

# US-087: Use the SDK against a Truss ontology

**Feature:** [[FEAT-031]]. **Feature Requirements:** EA-01, EA-03.
**PRD Requirements:** FR-55. **Priority:** P0 within the proposal.

## Story

**As a** Schema Integration Maintainer adopting the SDK for a Truss ontology,
**I want** a Truss target that runs the same generated queries, action clients
and bulk commands through Truss's own protected paths,
**So that** application developers get the typed SDK while Truss keeps sole
control of admission, transactions, journal, feed, receipts and bulk execution.

## Context

Truss stores domain values in fixed generic tables keyed by catalog property IDs
(Truss ADR-002, CONTRACT-001), so its storage is never a binding target for
generated code. CONTRACT-069 instead has Truss implement the CONTRACT-072
`ReadTarget`, `ActionExecutor` and `BulkTarget` protocols over its own paths:

- reads compile through Weft's Truss runtime backend (`truss.postgresql.runtime`
  with `truss-runtime-binding/0.4`) and execute through Truss's read execution
  path (Truss CONTRACT-007);
- actions go to Truss's protected action admission (Truss
  `action-subject-authority.proposal.md`), which authenticates the subject,
  authorizes, commits, journals (Truss CONTRACT-002) and emits feed entries
  (Truss CONTRACT-006);
- bulk commands compile through Weft's Truss mutation backend (Weft CONTRACT-009)
  and run as a CONTRACT-903 manifest under CONTRACT-904 coordination.

The adapter lives in the Truss repository and is adopted through Truss's own
governed design. UMF supplies the shared conformance suite and this story's
acceptance; Truss supplies the engine witnesses. Adoption is recorded in a
CONTRACT-069 packet and is `qualified` only when both pass.

## Walkthrough

1. The maintainer compiles the catalog for the Truss target against Truss's
   accepted catalog revision.
2. Truss's adoption design provides `TrussTarget` in the Truss repository.
3. The maintainer runs the UMF conformance suite against `TrussTarget` with
   Truss's native fixtures, then the Truss witnesses.
4. The maintainer compares every witness with Truss's native client on an
   identically seeded isolated store.
5. The maintainer records the adoption packet. Any missing witness leaves it
   `proposed` or `refused`; the native client stays in use.

## Acceptance Criteria

- [ ] **US-087-AC1** — Given a catalog compiled through Weft's Truss runtime backend against the accepted catalog revision, when a generated query runs on `TrussTarget`, then it executes only through Truss's read execution path with its admission, session settings, decoders and Weft host obligations, returns the same rows as Truss's own read path on the same data, and a statement log shows no other SQL against Truss tables; a target reporting a different binding version or catalog revision raises `NotCompiledForTarget`.
- [ ] **US-087-AC2** — Given an enrolled human with the mapped action role, an enrolled human without it, an enrolled service invoking a `person-required` action, and an unenrolled module writer, when each invokes the same action through `TrussTarget` and through Truss's native client, then every call reaches Truss's protected action admission and both paths reach the same admission outcome; refusals keep Truss's code and are never reported as `Rejected` or success.
- [ ] **US-087-AC3** — Given two identically seeded isolated Truss stores, when the same admitted action commits through the SDK on one and through Truss's native client on the other, then entity state, journal entries, feed entries and feed acknowledgement progress are equal apart from store identity, and the SDK's `Committed` receipt equals the receipt Truss reports for that invocation.
- [ ] **US-087-AC4** — Given concurrent conflicting invocations, an injected failure before COMMIT, and a connection lost after COMMIT is sent, when each runs through `TrussTarget`, then the losing concurrent call raises `ActionConflict` and is rolled back; the pre-commit failure leaves no state, journal or feed change, keeps Truss's failure classification and raises `ActionFailed` rather than `ActionConflict`; the lost commit raises `ActionIndeterminate`; none is retried by the adapter.
- [ ] **US-087-AC5** — Given a committed or rejected invocation made with an idempotency key, when the same caller repeats it with the same key and equal input, then the call returns the original outcome unchanged, without re-evaluating preconditions and with no new journal or feed entry; repeating the key with different input returns Truss's request-conflict refusal without a business write.
- [ ] **US-087-AC6** — Given a bulk command compiled through Weft's Truss mutation backend, when the maintainer calls `seal()` and then `submit(manifest)` on the Truss plan, then Truss materializes and seals a CONTRACT-903 manifest under its own selection and guard custody, `submit()` hands that sealed manifest to CONTRACT-904 coordination run by Truss and returns a `BulkJob`, and the manifest items, batch outcomes and job status equal those from Truss's own bulk path on an identically seeded store.
- [ ] **US-087-AC7** — Given a Field whose Truss value definition requires authored lexical spelling to round-trip (for example an exact decimal token or an offset-bearing timestamp), when an action input or bulk assignment would write that Field through the SDK, then the adapter refuses before Truss admission and no write occurs, while reads still decode the value.
- [ ] **US-087-AC8** — Given an input that fails one or more preconditions and an input that passes, when each is checked with the generated `validate()` through `TrussTarget` and through Truss's native preview operation, then each call reaches Truss's preview and no admission, the `ValidationResult` failures and validity equal what the preview reports, `complete` is true only when Truss reports that every check was evaluated and false when the preview stops at the first failure, and no state, journal or feed entry changes.

## Edge Cases

- A changed Truss version, Weft backend version, binding version or catalog
  revision requires requalification; until then the adapter refuses.
- An adapter outcome that differs from Truss's native path is
  `ADOPTION_MISMATCH`; missing witnesses or engine authority is
  `ADOPTION_INCOMPLETE`. Both keep the evidence and leave the native client in
  use.
- A failed read never becomes an empty result.
- A replay request whose original revision is retired still returns the
  retained outcome; a fresh request for a retired revision refuses.
- `seal()` reserves no data or authorization; a manifest that later conflicts
  stops its job under CONTRACT-904 rather than being re-materialized.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| truss_reads_use_truss_read_path | US-087-AC1 | Catalog for the accepted revision; statement logging; mismatched binding pin | Equal rows; only read-path statements; `NotCompiledForTarget` |
| truss_action_admission_matches_native | US-087-AC2 | Four subject fixtures; SDK and native client | Same admission outcome per subject; Truss codes kept |
| truss_commit_parity_with_native_client | US-087-AC3 | Twin isolated stores; one admitted action | Equal state, journal, feed and ACK; receipt matches Truss |
| truss_conflict_and_failure_classification | US-087-AC4 | Barrier-synchronized conflict; pre-commit fault; post-COMMIT loss | `ActionConflict`; no effects with Truss classification; `ActionIndeterminate` |
| truss_idempotent_replay | US-087-AC5 | Same key with equal and different input | Original outcome unchanged; request-conflict refusal; no new writes |
| truss_bulk_manifest_parity | US-087-AC6 | Compiled command; twin stores | Equal sealed manifest, batch outcomes and job status |
| truss_lexical_spelling_refusal | US-087-AC7 | Spelling-sensitive decimal and timestamp Fields | Refusal before admission; reads decode |
| truss_validate_maps_preview | US-087-AC8 | Failing and passing inputs; SDK `validate()` and native preview | Equal findings; `complete` as Truss reports; no writes |

## Dependencies

US-083, US-085 and US-086 (catalog, action client and bulk command surfaces);
CONTRACT-069, CONTRACT-072, CONTRACT-901, CONTRACT-903 and CONTRACT-904. Truss
dependency T-1: public read, action admission and bulk APIs callable by an
adapter, and a Truss-local adoption design. Truss authorities: ADR-002,
CONTRACT-002, CONTRACT-004, CONTRACT-006, CONTRACT-007, CONTRACT-009,
CONTRACT-010 and `action-subject-authority.proposal.md` (Truss repository).
Weft CONTRACT-009 and the Truss runtime backend. Feature requirements: EA-01,
EA-03; PRD FR-55. TD-087 owns implementation detail; STP-087 owns the test
mapping.

## Out of Scope

Writing the adapter in UMF, editing Truss contracts, any direct SQL or table
handle for Truss storage, and a lexical-preserving value carrier (an open owner
decision). Host scheduling and workers for bulk jobs remain host-owned. Adoption
does not follow from this specification or from UMF-local tests.
