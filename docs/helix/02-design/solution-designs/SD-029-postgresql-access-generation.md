---
ddx:
  id: SD-029
  type: solution-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-029
      kind: informed_by
    - id: ADR-004
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# SD-029: PostgreSQL access generation

**Feature:** [[FEAT-029]]. **Contracts:** CONTRACT-067/068/069 and existing
CONTRACT-042/043 native binding/generation authority.

## Scope

Use the resolved compiler IR to generate explicit SQLAlchemy 2 mappings for
ordinary bound tables and Core declarations for protected/generic engine tables.
No shared repository runtime is introduced.

## Requirements Mapping

| Requirement | Design element | Verification owner |
| --- | --- | --- |
| PG-01/02 | Explicit native types, names, identity and codecs | US-082/STP-082 |
| PG-03/05 | No session factories; reuse UMF native generators | US-082/STP-082 |
| PG-04 | Truss-owned composition and isolated equivalence packet | US-084/STP-084 |

## Solution Approaches

Select standard SQLAlchemy declarations plus separate Pydantic DTOs. Ordinary
applications may use their own Sessions; Truss initially consumes Core/codec
output through its current driver boundary. A shared active-record abstraction
would introduce flush/cascade authority and conflict with generic storage.
Retaining all handwritten mappings would avoid a new dependency but continue
duplicating schema interpretation and value policy.

## Domain Model

Logical Record/Field/Key/Relationship identities map through explicit binding
choices to table/column/constraint declarations. Truss's physical storage schema
and a user's domain catalog are independent compiler inputs. Domain instance
types do not create domain tables. No SQLAlchemy identity map supplies UMF
identity/equality or proves uniqueness.

## System Decomposition

TD-082 owns the PostgreSQL emitter and native round-trip corpus. TD-084 owns the
adoption packet generator/checker and consumer integration handoff. The existing
UMF PostgreSQL projection remains DDL authority; no second DDL generator is
implemented inside templates. Hosts alone construct connections and execution.

## Technology Rationale

SQLAlchemy 2 typed declarations provide inspectable storage types. Driver and
exact version selection require the bounded spike. PostgreSQL 17.11 is the
Truss candidate; existing older PostgreSQL receipts cannot qualify the new path.

## Traceability

STP-082 covers mapping, native value/refusal behavior and import isolation;
STP-084 covers fixed-layout, protected admission, transaction/journal/feed and
concurrency equivalence. Native tests must use original UMF generation and
independent catalog/value observations rather than generated expectations alone.

## Concern Alignment

Keep vendor imports in the emitted backend module and host harness. Pure compiler
modules consume metadata, never driver objects. Exact values and unknown native
refinements survive or refuse. No single-package override is introduced.

## Constraints & Assumptions

Truss's current accepted storage/protected-execution contracts retain authority.
Consumer-local adoption is a separate gate; this design does not accept a new
Truss profile. Narrow read-only adoption can ship before protected mutations,
but must state that narrower scope.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Implicit ORM flush/lazy loading | Protocol bypass | No generated sessions; Core default for Truss; explicit DTO extraction |
| PostgreSQL rounds or normalizes values | Silent meaning change | Pre-bind exact checks plus independent native counterexamples |
| Generic storage mapped as domain tables | Layout violation | Separate physical/domain inputs and no-DDL adoption assertion |
| Existing protected path incomplete | False acceptance | Block corresponding adoption scope; preserve original evidence |
