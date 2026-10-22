---
ddx:
  id: FEAT-031
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: derived_from
---

# Feature Specification: FEAT-031 — Engine target adapters (Truss, Ashlar)

**Priority:** P0 within this proposed capability; no existing release order changes.
**Owner:** UMF maintainers for the conformance boundary; Truss and Ashlar
maintainers for their adapters.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation — typed data access SDK.
**Covered PRD Requirements:** FR-55; supporting FR-43 and NFR-50.

## Overview

Truss and Ashlar adopt the SDK by implementing the CONTRACT-072 target protocols
over their own protected execution paths. Generated clients and catalog entries
then work against a Truss ontology or an Ashlar publication the same way they work
against raw tables. Truss supports reads, actions and bulk commands. Ashlar
supports publication-pinned reads only. Each adapter lives in its engine's
repository and is adopted through that repository's own design. CONTRACT-069
states the conformance the SDK requires.

## Ideal Future State

A service swaps a `LakebaseTarget` for a `TrussTarget` and keeps its generated
models, queries and action calls. Truss still authenticates, authorizes, journals
and emits feed entries exactly as its own client would. An analytics job reads an
Ashlar publication through the same typed queries and always sees one pinned
publication, never a mix of table versions.

## Problem Statement

Both engines already generate their own storage from UMF. Truss generates
internal DDL and stores domain values in generic JSONB keyed by catalog property
IDs. Ashlar generates its Delta DDL and stores generic STRING JSON columns.
Neither layout is a domain table, so neither is a binding target for generated
models. A client that wrote to that storage, or read Ashlar's latest tables
directly, would bypass Truss admission, journal and feed, or Ashlar's
publication resolver, pin custody and fencing. Developers still want one typed
interface across raw tables and engines. The adapters must provide it without
opening a back door.

## Functional Areas

| Area | User job | Responsibility |
| --- | --- | --- |
| Truss reads | Query an ontology | Catalog entries compiled by Weft's Truss runtime backend, run through Truss's read path |
| Truss actions | Change data through actions | Submit to Truss's protected action admission; map its result to an outcome |
| Truss bulk | Change many entities | `preview()`, `seal()` of a CONTRACT-903 manifest and `submit()` to CONTRACT-904 coordination run by Truss |
| Ashlar reads | Query a publication | Resolver-pinned reads against exact table UUIDs and versions |
| Adoption | Prove the adapter matches the engine | Engine-local design, adoption packet, conformance suite and engine witnesses |

## Requirements

- **EA-01:** The Truss adapter must implement `ReadTarget`,
  `ReplayingActionExecutor` and `BulkTarget` only through Truss's protected paths. Reads run catalog entries
  compiled by Weft's Truss runtime backend through Truss's read execution path
  with its admission, session settings and decoders. Actions go through Truss's
  action admission, which authenticates, authorizes, evaluates, commits, journals
  and emits feed entries. Bulk commands use CONTRACT-903 manifests, sealed and
  then submitted to CONTRACT-904 coordination executed by Truss. The adapter maps CONTRACT-068
  carriers to Truss's public carriers. Where Truss needs an exact value's
  authored lexical spelling to round-trip, the adapter refuses to re-encode a
  value read through the SDK until a lexical-preserving carrier exists.
- **EA-02:** The Ashlar adapter must implement `ReadTarget` only. Every read
  enters Ashlar's authorized publication resolver and runs inside the pinned
  interval, against the exact table UUIDs and version vector of the resolved
  publication. There is no latest-table fallback. A missing, replaced or expired
  snapshot refuses, and a failed read never becomes an empty result. A page
  continuation records the target identity digest, including the publication
  vector, and raises `StaleContinuation` on any other publication.
- **EA-03:** Each adapter must be adopted through an engine-local design in its
  own repository. Qualification records a CONTRACT-069 adoption packet and passes
  the CONTRACT-072 conformance suite plus the engine witnesses. No generated code
  or adapter path may reach engine storage directly: no table handles, no
  connections with write privileges, no SQLAlchemy mappings, and no SQL against
  engine tables other than catalog statements run through the engine's read path.

### Non-Functional Requirements

Engine contracts keep execution authority and win any conflict; the adapter then
refuses until the conflict is reconciled upstream. A new engine, Weft backend,
binding or catalog revision requires requalifying the affected scope. Runtime
errors keep the engine's classification and retry policy.

## User Stories

- US-087 — Use generated clients and catalog entries against a Truss ontology.
- US-088 — Read an Ashlar publication through publication-pinned typed queries.

## Edge Cases and Error Handling

- A target reporting a Truss runtime binding version other than the catalog pin
  raises `NotCompiledForTarget`.
- A concurrent conflicting Truss invocation classifies as `Conflict` and rolls
  back. An injected failure before COMMIT keeps Truss's classification: a
  confirmed rollback raised as `ActionFailed`, not `Conflict`.
- Replaying an equal idempotent request on Truss returns the original outcome
  (CONTRACT-901 as implemented by Truss).
- An Ashlar read whose table identity changes between resolve and read refuses.
  A renamed alias refuses.
- An empty Ashlar publication returns an empty page only when the resolver
  reports it complete.
- Ashlar instants outside Python's `datetime` range refuse at decode.
- An action client cannot be built for an Ashlar target, because Ashlar provides
  no `ActionExecutor`.
- Search refuses on both engines in 0.1 (CONTRACT-074).
- Missing witnesses or engine authority refuse adoption with
  `ADOPTION_INCOMPLETE`; a result that differs from the engine's native path
  refuses with `ADOPTION_MISMATCH`. Both keep their evidence.

## Success Metrics

Targets, not observed results:

- Truss: authorized and unauthorized invocations reach the same admission outcome
  as Truss's native client; committed actions produce identical state, journal,
  feed, receipt and ACK; bulk sealing and coordinated execution match Truss's own
  bulk path.
- Ashlar: pinned reads return the same rows as Ashlar's resolver path; every
  stale-identity case refuses.
- Both adapters pass the conformance suite for the capabilities they claim.

## Constraints and Assumptions

Truss's generated JSONB storage and Ashlar's generated STRING JSON Delta storage
stay engine-owned; this feature does not change either. Weft compiles catalog
entries for both engines through its existing backends (for Truss, currently
`truss.postgresql.runtime` with `truss-runtime-binding/0.4`). Truss needs a public
action admission path, and Ashlar needs resolver-pinned read execution for
adapters; these are engine-side dependencies. This feature amends no sibling
contract. Specifications establish no engine support.

## Dependencies

FEAT-028, FEAT-029 and FEAT-030 (protocols, outcomes and conformance suite).
Proposed CONTRACT-069 and CONTRACT-072. CONTRACT-900/901/903/904 for Truss
actions and bulk work. Truss and Ashlar contracts for execution authority.

## Out of Scope

Generated access to engine storage, changes to engine storage layouts, Ashlar
writes, ACK progress and publication (they stay Ashlar's own protocol), search on
engines in 0.1, a lexical-preserving exact-value carrier, and adoption decisions,
which belong to each engine's repository.
