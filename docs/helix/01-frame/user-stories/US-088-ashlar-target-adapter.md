---
ddx:
  id: US-088
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-031
      kind: informed_by
---

# US-088: Read Ashlar publications through the SDK

**Feature:** [[FEAT-031]]. **Feature Requirements:** EA-02, EA-03.
**PRD Requirements:** FR-55. **Priority:** P0 within the proposal.

## Story

**As a** Schema Integration Maintainer adopting the SDK for Ashlar,
**I want** an Ashlar target that runs generated queries only against one
resolved, pinned publication,
**So that** application developers get typed reads with exactly the immutability,
retention and authorization guarantees of Ashlar's own resolver path, and cannot
write through the SDK.

## Context

Ashlar stores published graph state in generic Delta tables and owns
publication, the publication resolver, pin custody, retention and fencing
(Ashlar CONTRACT-001 to CONTRACT-004). A table's latest version is not a
publication. CONTRACT-069 has Ashlar implement only CONTRACT-072 `ReadTarget`:
every read enters Ashlar's authorized resolver (`resolve_publication`) and runs
inside its pinned interval against the exact table UUIDs and version vector of
the resolved publication, with identity checked before and after. A missing,
replaced or expired snapshot refuses; there is no latest-table fallback.

Catalog entries compile through Weft's Ashlar/Databricks backend. The adapter
lives in the Ashlar repository under Ashlar's own adoption design; UMF supplies
the shared conformance suite and this story's acceptance.

## Walkthrough

1. The maintainer compiles the catalog for the Ashlar target with Ashlar's
   pinned Weft backend and Databricks SQL profile.
2. Ashlar provides `AshlarTarget` with trusted configuration: publication
   identity, required tables and their native UUIDs, and resolver policy.
3. The maintainer runs the UMF conformance suite and Ashlar's witnesses.
4. A developer calls a generated query with `AshlarTarget`; the result is one
   publication's rows, or a refusal, never a silent mix.
5. A developer who tries to build an action client with `AshlarTarget` gets a
   type error.

## Acceptance Criteria

- [ ] **US-088-AC1** — Given a catalog compiled through Weft's Ashlar/Databricks backend and a publication the resolver authorizes, when a generated query runs on `AshlarTarget`, then the statement executes inside the resolver's pinned interval against the resolved table UUIDs and version vector, returns the same rows as Ashlar's own resolver read path for that publication, and returns an empty page only when the resolver reports the authorized answer complete.
- [ ] **US-088-AC2** — Given a publication whose snapshot has been replaced or whose retention window has expired, when a generated query runs, then the read refuses with Ashlar's classification, returns no rows and never falls back to the latest table version.
- [ ] **US-088-AC3** — Given trusted configuration naming a table whose alias has since been renamed or now resolves to a different table UUID, when a generated query runs, then the read refuses before or at Ashlar's closing alias check and no rows are released.
- [ ] **US-088-AC4** — Given a table whose native identity changes between resolution and execution, when a generated query runs, then the identity check refuses the read, withholds any rows already fetched and does not report an empty result.
- [ ] **US-088-AC5** — Given a page read from publication P1, when the developer requests the next page with its continuation after the target resolves P2 or after P1 expires, then the read raises `StaleContinuation` and never continues against P2; a new read without the continuation runs against the currently resolved publication.
- [ ] **US-088-AC6** — Given an instant column delivered in Ashlar's epoch-microsecond text carrier, when a page is decoded, then values within Python's `datetime` range decode exactly to aware UTC datetimes, and a value outside that range or a malformed token refuses the whole read rather than returning a partial page.
- [ ] **US-088-AC7** — Given an `AshlarTarget`, when a developer constructs the generated `Actions` client or calls a bulk command with it, then pinned pyright and mypy report a type error, and at run time construction raises `TypeError` before any Ashlar call.

## Edge Cases

- A publication the caller is not authorized to read is refused by the resolver
  without confirming whether it exists.
- Fields whose Ashlar carrier the Weft backend does not admit (currently
  anything beyond qualified string scalars and string presence envelopes, unless
  Ashlar admits further handlers) refuse at catalog build.
- A Databricks engine, build or ANSI setting other than the pinned profile
  refuses; there is no newer-engine fallback.
- A closing-check failure withholds the result even when the query itself
  succeeded.
- A policy change between pages invalidates the continuation.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| ashlar_pinned_read_matches_resolver | US-088-AC1 | Authorized publication; empty complete publication | Rows equal resolver path; empty only when complete |
| ashlar_replaced_or_expired_refuses | US-088-AC2 | Replaced snapshot; retention window passed | Refusal; no rows; no latest read |
| ashlar_renamed_alias_refuses | US-088-AC3 | Table renamed; name repointed to another UUID | Refusal; no rows released |
| ashlar_identity_change_refuses | US-088-AC4 | Table replaced between resolve and read | Refusal; fetched rows withheld |
| ashlar_continuation_bound_to_publication | US-088-AC5 | Page from P1; P2 published; P1 expired | Continuation refused; fresh read uses current publication |
| ashlar_instant_range_refuses | US-088-AC6 | Boundary, out-of-range and malformed epoch-microsecond tokens | Exact decode within range; refusal otherwise |
| ashlar_has_no_action_executor | US-088-AC7 | `Actions(AshlarTarget(...))`; bulk call | Static error; runtime `TypeError`; no Ashlar call |

## Dependencies

US-083 (catalog build and read surface); CONTRACT-068, CONTRACT-069,
CONTRACT-071 and CONTRACT-072. Ashlar dependency A-1: resolver API for pinned
execution by an adapter and an Ashlar-local adoption design. Ashlar authorities:
CONTRACT-001 (publication boundary), CONTRACT-002 (consumer read boundary),
CONTRACT-003 (Delta graph tables) and CONTRACT-004 (publication resolver),
Ashlar repository. Weft's Ashlar/Databricks backend. Feature requirements:
EA-02, EA-03; PRD FR-55. TD-088 owns implementation detail; STP-088 owns the test
mapping.

## Out of Scope

Writes, ACK progress and publication through the SDK; an Ashlar
`ActionExecutor` or `BulkTarget`; latest-table reads; history and change-feed
operations; writing the adapter in UMF or editing Ashlar contracts.
