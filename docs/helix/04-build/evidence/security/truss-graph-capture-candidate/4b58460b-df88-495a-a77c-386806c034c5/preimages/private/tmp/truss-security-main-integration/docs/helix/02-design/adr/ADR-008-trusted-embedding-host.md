---
ddx:
  id: ADR-008
  type: adr
  activity: design
  status: accepted
  authoring:
    home: repo
  links:
    - id: ADR-003
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
---

# ADR-008: Trust the embedding host and registered database adapter

| Date | Status | Deciders | Related | Confidence |
| --- | --- | --- | --- | --- |
| 2026-10-09 | Accepted | Product owner | ADR-003, CONTRACT-007 | High for scope; native integration unqualified |

## Context

Truss is an embeddable toolkit. Python object identity and private admission
registries can enforce correct in-process orchestration, but PostgreSQL cannot
independently authenticate a Python object's identity from a SQL argument.
Requiring protection from a malicious embedding process with the same database
credentials would impose a different deployment boundary.

## Decision

Trust the embedding application and its registered database adapter. Enforce
isolation, authorization, integrity and transaction rules against their data
callers. The owner explicitly adopted this recommendation and the minimum security
handoff for installation and initial Python operations.

The trusted host preserves genuine connection/transaction custody, exclusive
execution, non-rewinding operation ordinals, cumulative resource accounting and
original attempt/recovery associations. These are host obligations to qualify,
not facts proven by PostgreSQL inspecting object identity. Ordinary data callers
cannot supply trusted callbacks, registrations or administrative credentials.

Native procedures still verify actual transaction/session identity, effective
privileges, current authorization, epoch/configuration and allowed effects.
Asserted origin metadata cannot grant authority. An authenticated database actor
remains distinct from a host-supplied actor field. Trusting the adapter does not
make forged input, stale admission, partial finalization or unknown settlement
successful. SQL-only supported writer routes retain their independently specified
native enforcement; this decision does not authorize bypassing them.

## Alternatives

| Option | Assessment |
| --- | --- |
| Trusted embedding host and adapter | Selected: fits embedded Python and the owner direction to bound controlled work. |
| Protect against a malicious host using the same credentials | Requires separately privileged service/credential boundaries; not the selected embedded deployment. |

## Consequences and qualification

Python custody can supply the original issued ordinal through the trusted
registered port. PostgreSQL need not prove its provenance from Python object
identity; native conflict/current-context checks remain mandatory. All four
admission families must stop deriving ordinals from surviving rows together.

Qualification must exercise rollback/nonreuse, multiple facades over the same
connection, exclusive dispatch, expiry/exhaustion, late failure and original
unknown-outcome recovery. Host trust is not a passing implementation receipt.

The security owner supplies the exact adopted subset/interface, authenticated
actor/current-permission observation, freshness/revocation/publication protocol,
required native routines/owners/grants and independent allowed/denied tests.
Installation and initial Python operations need this concrete subset; unrelated
security capabilities are not prerequisites. Truss must not fork its resolver or
adopt a partial component count as a complete handoff.
