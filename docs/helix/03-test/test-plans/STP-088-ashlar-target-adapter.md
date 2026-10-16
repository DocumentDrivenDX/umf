---
ddx:
  id: STP-088
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-088
      kind: informed_by
    - id: TD-088
      kind: informed_by
---

# STP-088: Read Ashlar publications through the SDK

## Story Reference

**User Story:** [[US-088-ashlar-target-adapter]].
**Technical Design:** [[TD-088-ashlar-target-adapter]].
**Related Solution Design:** [[SD-031]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Allocate every US-088 criterion between the UMF-owned shared conformance suite
and value tests and the Ashlar-owned engine witnesses, so that an Ashlar
adoption packet reaches `qualified` only when both have passed for exact pins.
UMF tests prove the suite and codecs; they never prove Ashlar's resolver
behavior.

All tests, fixtures and commands in this plan are planned and **UNTESTED** until
created and executed. The citations below are required future test-source
annotations, not coverage.

## Acceptance Criteria Test Mapping

UMF conformance cases live in `python/umf_access/conformance/` and carry the
citation. Ashlar runs them against `AshlarTarget` with its own native fixtures
and adds the witnesses in the last column in the Ashlar repository.

| AC ID | Failing test to create | Asserted behavior | Required source citation | Engine-owned witness (Ashlar repository) |
| --- | --- | --- | --- | --- |
| US-088-AC1 | `ashlar_pinned_read_matches_resolver` (conformance `reads.parity`, `reads.empty_complete`) | Rows equal the engine's reference read for the same resolved publication; an empty page appears only with the engine's complete status. | `@covers US-088-AC1` | Same rows as Ashlar's resolver read path at the pinned UUID/version vector; empty publication returns empty only when the resolver reports it complete |
| US-088-AC2 | `ashlar_replaced_or_expired_refuses` (conformance `reads.refusal_not_empty`) | An engine refusal surfaces as an exception, never as an empty page or rows. | `@covers US-088-AC2` | Replaced snapshot and passed retention window both refuse; query history shows no latest-version read |
| US-088-AC3 | `ashlar_renamed_alias_refuses` (conformance `reads.refusal_not_empty`, alias variant) | The refusal releases no rows. | `@covers US-088-AC3` | Table renamed, and name repointed to another UUID, each refuse at resolution or closing alias check |
| US-088-AC4 | `ashlar_identity_change_refuses` (conformance `reads.withheld_rows`) | Rows fetched before a closing-check failure are not returned; the result is an exception, not an empty page. | `@covers US-088-AC4` | Table replaced between resolution and execution refuses on the identity check |
| US-088-AC5 | `ashlar_continuation_bound_to_publication` (conformance `reads.continuation`) | A continuation from P1 raises `StaleContinuation` once the target resolves P2 or P1 expires; a fresh read without it returns P2's rows. | `@covers US-088-AC5` | P1 then P2 published on a dedicated schema; P1 retention expiry; policy revision change |
| US-088-AC6 | `ashlar_instant_range_refuses` (UMF value tests plus conformance `values.instant_micros`) | `-62135596800000000` and `253402300799999999` decode exactly; one microsecond beyond either, int64 limits, `-0`, leading zeros and over-long tokens refuse the whole read. | `@covers US-088-AC6` | Native rows carrying boundary and out-of-range instants through Ashlar's epoch-microsecond carrier |
| US-088-AC7 | `ashlar_has_no_action_executor` (static case `tests/static/ashlar_actions_bad.py`; conformance `protocols.no_executor`) | Pyright and mypy report constructing `Actions` and calling a bulk command with `AshlarTarget`; at run time `Actions(...)` raises `TypeError` and a recording target sees no call. | `@covers US-088-AC7` | None required; Ashlar confirms its target exposes no write method |

## Executable Proof

UMF planned commands (none exist yet):

```sh
python -m pytest python/umf_access/tests/test_instant_micros_codec.py
python -m pytest python/umf_access/tests/static/test_ashlar_no_actions.py
python -m pytest python/umf_access/tests/conformance_selftest/
python -m pytest python/umf_access/tests/build/test_ashlar_targets.py
```

The self-test runs the read cases against faulty fake targets (one that falls
back to latest, one that returns empty on failure, one that ignores continuation
binding) and must fail each. Ashlar-owned commands are defined by the Ashlar
adoption design and run in the Ashlar repository on the pinned Databricks
profile; they are not UMF gates and cannot be marked passing from here. A
missing workspace is recorded as not run. Retain UMF results under
`docs/helix/04-build/evidence/typed-persistence/`; the adoption packet references
Ashlar's receipts by digest.

## Data and Setup

UMF: fake targets, a small model with one string-keyed Record and one instant
Field, and the boundary vectors above. Ashlar: a dedicated workspace schema with
owned Delta tables, two publications, a configurable retention window, a rename
and a table replacement fixture, and an authorized and an unauthorized principal.

## Edge Cases and Failure Modes

Unauthorized principal (refusal without existence disclosure), unpinned engine
build or ANSI setting (refusal), Field types the Ashlar decoder does not admit
(build refusal), and policy change between pages (continuation refused).

## Build Handoff

UMF builds the codec, continuation type and conformance cases with their
self-test first, then Ashlar catalog targets. Ashlar implements the adapter and
witnesses under its own design. Every AC needs an exercising assertion carrying
its `@covers` tag and, where listed, a passing Ashlar witness. Adoption is
`qualified` only for the exact pins in the packet.
