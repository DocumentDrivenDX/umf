---
ddx:
  id: FEAT-029
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: derived_from
---

# Feature Specification: FEAT-029 — PostgreSQL access generation

**Priority:** P0 within this proposal. **Owner:** UMF maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation.
**Covered PRD Requirements:** FR-53; supporting FR-43/44 and NFR-50.

## Overview

Generate typed PostgreSQL storage access from explicit UMF bindings, using
SQLAlchemy 2 mappings where appropriate and preserving consumer-owned execution.

## Ideal Future State

Application maintainers use generated mappings and codecs against a verified
schema. Graph-engine maintainers reuse the same generation without replacing
their generic storage layout or protected transaction protocol.

## Problem Statement

Repeated table mappings and value conversions drift from their source model.
Treating domain records as physical tables also conflicts with generic graph
storage. Generation must distinguish those inputs and their authority.

## Requirements

- **PG-01:** Generate physical table mappings only from complete explicit bindings, retaining stable logical and physical identities.
- **PG-02:** Preserve qualified types, key ordering, null/default rules and relationship storage; distinguish database enforcement from client validation.
- **PG-03:** Generated mappings must leave connections, transactions, isolation, locks, retries and migrations under host ownership.
- **PG-04:** Truss adoption must preserve fixed generic tables, exact values, protected admission and mutation/journal/feed atomicity.
- **PG-05:** Reusable schema projection and DDL must use UMF's existing PostgreSQL facilities; graph query lowering remains Weft-owned.

### Non-Functional Requirements

Zero native writes may occur on import or generation. Every admitted mapping must
pass the pinned PostgreSQL native corpus; static checks must reject the planned
invalid field/result uses. No performance or concurrency equivalence is claimed
without same-workload measurements.

## User Stories

- [US-082](../user-stories/US-082-generated-postgresql-access.md).
- [US-084](../user-stories/US-084-truss-generated-substrate.md).

## Edge Cases and Error Handling

Tables without a proven ORM identity may receive SQLAlchemy Core declarations,
not invented primary keys. Unsupported collations, domains, SQL expressions,
native numeric carriers and composite identity rules refuse or remain explicit
residuals. A source fingerprint cannot establish installed schema correspondence.

## Success Metrics

All admitted native cases preserve values and intended constraint behavior;
Truss adoption witnesses preserve journal/feed outcomes and refusals. No bypass
write is admitted by the generated public surface.

## Constraints and Assumptions

PostgreSQL 17.11 is the initial Truss qualification candidate, not a universal
support claim. SQLAlchemy 2 is a proposed integration, pending exact driver and
version qualification. Existing direct-driver protected paths may remain.

## Dependencies

FEAT-028, CONTRACT-042/043 and proposed CONTRACT-067/068/069. Truss's own
accepted storage and execution contracts govern downstream adoption.

## Out of Scope

Automatic production migration, replacement of Truss authorization or Weft,
per-domain Truss DDL, implicit cascades, universal repositories, connection pools
and runtime guarantees inferred from model validation.
