---
ddx:
  id: FEAT-028
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: derived_from
---

# Feature Specification: FEAT-028 — Typed model generation

**Priority:** P0 within this proposed capability; no existing release order changes.
**Owner:** UMF maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation — typed data access SDK.
**Covered PRD Requirements:** FR-52; supporting FR-41, FR-43 and NFR-50.

## Overview

This is stage one of the typed data access SDK (ADR-004). A maintainer authors
how each Record looks to Python in the `umf.access` extension. A generator then
turns pinned UMF documents into a checked-in Python package: Pydantic models,
Key DTOs, typed column and search-index expressions, codecs and typed action
types. FEAT-029 builds queries on these types; FEAT-030 and FEAT-031 run them.
Python models of UMF documents themselves (CONTRACT-051) stay separate.

## Ideal Future State

A maintainer changes a Field in UMF, regenerates, and reviews one diff. The type
checker then lists every affected query and call site. Application code never
hand-writes a model, a Key class or a value conversion. Generated code runs
without a JavaScript runtime, the UMF compiler or a database connection. Unknown
UMF content is never dropped, and a successful generation never authorizes
execution on its own.

## Problem Statement

Hand-written application types drift from schema meaning. Generic JSON Schema
conversion does not help enough: it cannot say whether a value may be absent,
null or both in each view, whether a field is engine-assigned, or what native
column type stores it. Core UMF and CONTRACT-042 bindings do not state these
choices either. Guessing them from names or target types gives plausible but
wrong models. Developers need exact, reviewable types whose limits are stated
rather than hidden.

## Functional Areas

| Area | User job | Responsibility |
| --- | --- | --- |
| Authoring | State presence, mutability, temporal kind and native columns | `umf.access` RecordViews and ColumnSets with a complete conflict table (CONTRACT-070) |
| Generation | Produce typed application code | Deterministic, offline, profile-pinned generator (CONTRACT-067) |
| Use | Construct, validate and encode values | Row, Create, Patch, projection and Key types plus codecs (CONTRACT-068) |
| Review | See what changed and what was not handled | Manifest, assertion census, obligations, drift check and manifest diff |

## Requirements

- **TM-01:** Instance views and native columns must be authored in `umf.access`
  (CONTRACT-070), never passed as generator options. Every reached Field needs
  exactly one FieldView. A view that contradicts core availability, nullability,
  Key or binding facts must refuse with `ACCESS_CONFLICT`; nothing is repaired.
- **TM-02:** Generation must be deterministic and offline. It must use exact
  source texts and an installed trusted profile pinned by ID, version, dependency
  versions and the SHA-256 of the profile's code. Every selected assertion must
  get a disposition in a complete census. Nothing is inferred from names,
  target types or defaults; missing or ambiguous meaning refuses.
- **TM-03:** Generated models must follow CONTRACT-068. Absence uses Pydantic's
  `MISSING`. Carriers are strict, frozen and closed. Exact decimals are accepted
  only when representable at the declared scale and precision, never rounded.
  Instants are aware and normalized to UTC; local date-times stay naive. Key DTOs
  keep declared component order and carry their UMF Key identity.
- **TM-04:** Generated source must be statically inspectable. No Pydantic field
  aliases are generated; codecs map Python names to authored Field IDs.
  Refactoring is schema-driven: regenerate, read the manifest diff
  (source-compatible, value-compatible or breaking) and fix what the type checker
  reports. Explicit `names` overrides keep a Python name or an authored ID stable.
- **TM-05:** The generated package must be checked into version control. `umf-access
  check` must fail on any byte difference. Regeneration must refuse with
  `OUTPUT_CHANGED` when a generated file was added, removed or edited by hand, and
  must replace the package atomically.
- **TM-06:** Document metadata must never cause code execution, network access,
  dependency installation, profile or template loading. Names and strings reach
  generated source only through literal escaping.

### Non-Functional Requirements

The same inputs and profile must produce identical bytes in Bun and in real
Chromium. Zero silent rounding or coercion is permitted in the supported subset.
Every support claim names the exact Pydantic, Python, pyright and mypy versions,
the profile subset and its evidence. CONTRACT-067 sets finite resource bounds;
over-limit requests refuse and output is never truncated.

## User Stories

- US-080 — Author access views and generate a reviewable typed package.
- US-081 — Use generated models, Key DTOs and codecs in application code.

## Edge Cases and Error Handling

- A selected Record without a RecordView refuses. A FieldView that omits or
  repeats a reached Field refuses with `ACCESS_COVERAGE`.
- A timestamp Field without `temporal`, or a ColumnSet type of the wrong temporal
  kind, refuses.
- A relational column cannot carry absence apart from null. `row.missing:true` on
  a ColumnSet-bound Field refuses.
- Floating-point Fields refuse with `LOSS` in 0.1, except embedding Fields that a
  search index references, which use the `Vector` carrier.
- Unknown semantics on the selected closure refuse in every mode. Unknown content
  on unselected elements is kept in `sources.json` with an `unselected`
  disposition.
- Name collisions, reserved names and case-folded path clashes refuse rather than
  merge identities.
- A failure before the directory swap leaves the previous package untouched.

## Success Metrics

Targets, not observed results:

- Every selected assertion in the acceptance corpus has a disposition.
- Every candidate package reproduces byte for byte across Bun and Chromium.
- Every CONTRACT-070 conflict row has a passing positive or negative fixture.
- The static positive/negative corpus passes on each pinned checker.
- Generated validators agree with UMF core validators on the golden-vector corpus.

## Constraints and Assumptions

ADR-002 governs the TypeScript generator and its browser portability. ADR-004
selects the `umf_access` runtime distribution that generated code imports.
Canonical UMF schemas remain the authority; generated Pydantic JSON Schema is an
application view. Inputs are local core 0.8.0 documents with `umf.access` 0.1.0;
there is no cross-document resolver and no automatic DDD conversion. Pydantic
2.14 or later is assumed for a stable `MISSING`. If the profile spike shows
`MISSING` does not behave as specified, the profile is unqualified; ABI 0.1 has
no fallback sentinel.

## Dependencies

CONTRACT-001/040/042/049/051 and CONTRACT-900 for actions. Proposed
CONTRACT-067, CONTRACT-068 and CONTRACT-070. CONTRACT-074 supplies search-index
declarations. FEAT-029, FEAT-030 and FEAT-031 consume the generated package.

## Out of Scope

SQL or DDL generation, database connections, migrations, query compilation
(FEAT-029), execution (FEAT-030, FEAT-031), dynamic model discovery at startup,
arbitrary user validators, SQLAlchemy or PySpark mappings, and any claim of
universal equivalence between Python and UMF semantics.
