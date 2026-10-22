---
ddx:
  id: TD-088
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-088
      kind: informed_by
    - id: SD-031
      kind: informed_by
---

# TD-088: Read Ashlar publications through the SDK

**User Story:** [[US-088-ashlar-target-adapter]]. **Feature:** [[FEAT-031]].
**Solution Design:** [[SD-031]].

## Scope

What UMF requires of an Ashlar read adapter and what UMF builds for it. The
adapter, its witnesses and its adoption design belong to the Ashlar repository;
this design does not specify Ashlar internals or amend Ashlar contracts.

## Technical Approach

**Division of work.**

| Work | Owner | Where |
| --- | --- | --- |
| `ReadTarget` protocol, `Page`, continuation type, decode codecs | UMF | `python/umf_access/protocols.py`, `python/umf_access/pages.py` |
| Read conformance cases, value cases and self-test | UMF | `python/umf_access/conformance/` |
| Catalog build for `ashlar` targets | UMF | `python/umf_access/build/ashlar.py` |
| `AshlarTarget`, resolver integration, native fixtures, witnesses | Ashlar | Ashlar repository, per its adoption design |

**Read procedure** (Ashlar-owned, required by CONTRACT-069):

1. Enter Ashlar's authorized publication resolver with the trusted publication
   identity and required table-to-UUID map. Authorization runs before any
   descriptor access.
2. Hold the complete pin interval. Execute the catalog statement against the
   resolved UUIDs and version vector, with Weft's publication, integrity and
   native-profile obligations.
3. Buffer the complete result, decode it, then run Ashlar's closing checks
   (descriptor, vector, alias correspondence, authorization, retention).
4. Release rows only after the interval closes successfully. Any refusal
   returns no rows and is never mapped to an empty page.

**Target identity.** `identity()` reports kind `ashlar`, the Weft backend and
binding pins and, once resolved, the publication ID and version vector. Catalog
entries match on the backend, binding and profile pins, not on the vector, so a
new publication does not require a new catalog.

**Continuations.** CONTRACT-071 pages return `Page[R, K]` whose `next_after` is a
CONTRACT-072 `Continuation[K]`: the last Key plus the target identity digest. For
Ashlar that identity includes the publication ID and version vector, and the
adapter also folds in the policy context of the read. Passing the continuation
back resumes only if the target's current identity digest is equal; otherwise
the runtime raises `StaleContinuation` before any statement (Ashlar CONTRACT-002
`CURSOR_INVALID` semantics). Passing `None` starts a new read on the currently
resolved publication.

**Instants.** Ashlar delivers instants as canonical signed-int64 decimal text of
microseconds since the Unix epoch (Ashlar CONTRACT-004). The UMF codec accepts
only the canonical form (no leading zeros, no `-0`, at most 20 characters),
converts with integer arithmetic to an aware UTC `datetime`, and refuses values
before `0001-01-01T00:00:00Z` or after `9999-12-31T23:59:59.999999Z`. A refusal
fails the whole read. Ashlar currently provides this carrier only for
`published_at` in `read_singleton`, and its Weft decoder admits only string
scalars, so instant and other non-string Fields need Ashlar dependency A-1.

**No writes.** `AshlarTarget` implements no `invoke` and no `plan`. The generated
`Actions` constructor is typed to `ActionExecutor` and bulk functions to
`BulkTarget`, so pinned checkers reject it. At run time the constructor checks
the executor against the runtime-checkable protocol and raises `TypeError`.

Trade-off: a refusal whenever custody cannot be proved, at the cost of more
failed reads near retention deadlines.

## Component Changes

UMF planned files (none exist yet): `python/umf_access/pages.py`,
`python/umf_access/codecs/instant_micros.py`,
`python/umf_access/conformance/{reads,values,protocols}.py`,
`python/umf_access/build/ashlar.py`. No Ashlar file is created or edited from UMF.

| AC | Component realization |
| --- | --- |
| US-088-AC1 | `conformance/reads.py` parity and empty-page cases; Ashlar resolver witness |
| US-088-AC2 | `conformance/reads.py` refusal-not-empty case; Ashlar replaced and expired snapshot witnesses |
| US-088-AC3 | Ashlar alias witness; `conformance/reads.py` refusal-not-empty case |
| US-088-AC4 | Ashlar identity-change witness; withheld-rows assertion in `conformance/reads.py` |
| US-088-AC5 | `pages.py` `Continuation[K]` identity-digest check and `StaleContinuation`; `conformance/reads.py` continuation case |
| US-088-AC6 | `codecs/instant_micros.py`; `conformance/values.py` boundary vectors |
| US-088-AC7 | Generated `Actions` typing (CONTRACT-068); runtime protocol check; `conformance/protocols.py` |

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| `ReadTarget`, `RowStream`, `TargetIdentity` | CONTRACT-072 | What `AshlarTarget` implements |
| Ashlar adapter rules and witnesses | CONTRACT-069 | Adoption decision |
| `Page[R, K]`, `Continuation[K]`, `StaleContinuation`, catalog pins | CONTRACT-071, CONTRACT-072 | Continuation bound to target identity |
| Resolver, pins, retention, read boundary | Ashlar CONTRACT-002, CONTRACT-004 | Engine authority |

## Data Model Changes

None. The continuation is an opaque runtime value, not persisted by UMF.

## Integration Points

Ashlar A-1 (resolver API for pinned execution by an adapter; adoption design).
Weft's Ashlar/Databricks backend at Ashlar's pinned build and Databricks SQL
profile. Ashlar's current Weft decoder admits qualified string scalars and
string presence envelopes; other Field types refuse at catalog build until
Ashlar admits handlers for them.

## Security

Authorization is Ashlar's and runs before descriptor access; caller strings are
not proof of identity. Refusals do not reveal whether a hidden publication
exists. The adapter has no write path and no table handles. Fixtures use a
dedicated workspace schema and owned tables.

## Testing

| AC | Test | Assertion | Owner |
| --- | --- | --- | --- |
| US-088-AC1 | `ashlar_pinned_read_matches_resolver` | Rows equal resolver path; empty page only with complete status | UMF conformance; Ashlar witness |
| US-088-AC2 | `ashlar_replaced_or_expired_refuses` | Refusal with no rows; no latest-version statement in the query history | Ashlar witness; UMF refusal-not-empty case |
| US-088-AC3 | `ashlar_renamed_alias_refuses` | Refusal; no rows released | Ashlar witness |
| US-088-AC4 | `ashlar_identity_change_refuses` | Refusal; fetched rows withheld; not empty | Ashlar witness; UMF withheld-rows case |
| US-088-AC5 | `ashlar_continuation_bound_to_publication` | `StaleContinuation` after P2 or expiry; fresh read uses P2 | UMF conformance; Ashlar witness |
| US-088-AC6 | `ashlar_instant_range_refuses` | Boundary vectors decode exactly; out-of-range and malformed refuse whole read | UMF value tests; Ashlar witness |
| US-088-AC7 | `ashlar_has_no_action_executor` | Static errors; `TypeError`; no Ashlar call | UMF static and conformance |

STP-088 owns the authoritative allocation between UMF and Ashlar.

## Migration & Rollback

The adapter is opt-in. If adoption is refused, applications keep using Ashlar's
own read API. Nothing in Ashlar storage or publication state changes.

## Implementation Sequence

1. UMF: continuation type, instant codec, conformance cases and self-test.
2. UMF: Ashlar catalog targets.
3. Ashlar: adoption design, adapter and witnesses in the Ashlar repository.
4. Ashlar: run suite and witnesses; record the adoption packet with exact pins.

Prerequisites: US-083, Ashlar A-1.

## Risks

Few Field types are currently readable through Ashlar's Weft decoder, which
limits early value. Retention deadlines and clock margins can make reads near
expiry refuse; that is correct but needs operator guidance.
