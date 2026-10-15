---
ddx:
  id: ADR-004
  type: adr
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: FEAT-028
      kind: informed_by
    - id: FEAT-029
      kind: informed_by
    - id: FEAT-030
      kind: informed_by
---

# ADR-004: Design-time persistence generation inside UMF

## Problem

Python consumers need typed instance models and physical access declarations
without copying UMF interpretation or moving application execution into UMF.
Truss's fixed generic storage and Ashlar's immutable publications prevent a
universal entity/session abstraction from carrying their complete semantics.

## Decision

Propose a portable TypeScript compiler in the UMF repository that emits ordinary
Python source, backend declarations and complete interpretation reports at design
or build time. Generated consumers own execution. This is a draft design decision;
the request does not authorize implementation or native adoption.

## Why We Chose This

### Over runtime model construction

Checked-in/generated Python source gives type checkers concrete symbols and lets
applications run without JavaScript or compiler/profile discovery. Runtime model
construction remains possible independently but does not satisfy this static API.

### Over a single SQLModel-style entity class

Separate row/create/patch/key/storage types preserve differing presence and
generation rules. Independent backend declarations do not force PostgreSQL unit
of work semantics onto Spark or graph publication.

### Over generating only from JSON Schema

UMF's explicit logical/native/binding semantics carry ordered identity,
relationships and execution limits that an instance JSON Schema alone does not.
Native generators and canonical semantic APIs remain reusable authorities.

## Consequences

**Good:** One interpretation boundary; reproducible, reviewable source; optional
backend dependencies; consumer protocol ownership remains explicit.

**Trade-offs:** More generated types and exact profile qualification work. Typed
models cannot prove arbitrary queries or concurrent integrity. Generated codecs
are duplicated per output package initially to avoid a new shared runtime ABI.

**Provisional risk:** Python 3.11/Pydantic 2/SQLAlchemy 2 compatibility, strict
sentinel behavior and exact-value transports require a bounded pinned spike.
Failure narrows or changes the draft target profile before implementation of
dependent emitters. It does not justify weakening source semantics.

**Drift signals:** Artifact-selected plugins, implicit session creation,
automatic migrations, domain-per-table Truss mapping, latest-table Ashlar reads,
or unsupported semantics disappearing from the report.

## Concern Impact

Retains ADR-002 and its single-package policy. Compiler modules are separately
owned inside the existing package; independent compiler distribution is deferred
until justified by actual release/dependency needs. Adopts the scoped source-code
modularity baseline recorded in concerns and architecture. Python is a target
language, not a change to UMF's implementation runtime.
