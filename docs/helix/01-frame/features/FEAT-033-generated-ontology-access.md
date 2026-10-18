---
ddx:
  id: FEAT-033
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: derived_from
---

# FEAT-033: Generate typed data access code

**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation — typed data access SDK.
**Covered PRD Requirements:** FR-56; supporting FR-8/25/39/41/51.

## Overview

Give UMF a schema and get one typed API for reading entities, following
relationships and invoking actions, whether stored in tables or an ontology. The generator uses the current UMF model,
with sensible defaults and no additional access-view authoring. Python clients
use only the standard library; TypeScript follows from the same API description.

Developers use the generated model query builders directly. The injected binding
determines where operations run without changing the application API. Reads
require no wrapper functions, decorators or separate parameter declarations.

## Ideal Future State

A developer changes their UMF schema, regenerates the client and lets the type
checker identify affected application code. Reads and actions have discoverable,
typed methods. The same plugin code works in the host or a worker by changing
its transport. The host owns execution, authorization and storage.

## Problem Statement

Applications currently reconstruct types, keys, relationship navigation and
mutation inputs by hand. These copies drift from the schema. Generated access
code should remove that duplication while preserving UMF's meaning.

## Functional Areas

| Area | What developers get |
| --- | --- |
| Describe | A machine-readable API derived from their UMF schema |
| Generate | Typed models, reads, links, actions and errors |
| Connect | A small transport interface usable by a host or worker |

## Requirements

The OA numbers retain traceability to the original Praxis R1–R21 request.
[The design](../../02-design/solution-designs/SD-033-generated-ontology-access.md)
explains the technical choices.

### Derive the API

- **OA-01 (R1):** Accept schemas expressed in the latest UMF model. Read the
  schema's declared version automatically; require no version or compatibility
  selection and no authored `umf.access` view. Build on UMF 0.10.0, including
  UUID and opaque 128-bit values.
- **OA-03 (R3):** Allow selection of exposed types/actions and record it. Include
  required value/key dependencies without exposing additional operations.
- **OA-04 (R4):** Emit one deterministic, schema-validated, language-neutral JSON
  API description with its own format version.
- **OA-05 (R5):** Describe fields, scalar/enum/structured/list types, exact-value
  constraints, cardinality, absence/null, named identity fields and named links in
  both directions with their multiplicities. Derive create/generated/immutable
  facts from declarations, retaining differences between actions.
- **OA-06 (R6):** Provide key lookup, bounded get-many, lists, typed filters and
  ordering, cursor paging, link traversal and optional link keys. Reads support
  explicit consistency and an at-least token for reading an action's changes.
  One expression DSL serves tables and ontologies. Filters, key selection and
  traversal compose directly; terminals execute through the injected binding.
  Query preparation/caching is optional rather than application scaffolding.
- **OA-07 (R7):** Generate typed action inputs with entity-specific keys,
  precondition reason identities and results containing change counts, receipts
  and consistency tokens. Support single/batch calls, explicit atomicity and
  optional idempotency keys.
- **OA-09 (R9):** Include effective limits and supported filter operators in the
  description. Supply useful defaults; allow ordinary settings to reduce limits.
- **OA-21 (R21):** Report unexpressible selected constructs at their source paths
  instead of dropping meaning. Retain original source and unknown content.
  Recognize the declared UMF version and diagnose unsupported input automatically.

### Generate usable code

- **OA-02 (R2):** Generated Python and description consumption require only the
  standard library, with no Pydantic, `umf_access`, Hohfeld, database or JavaScript
  runtime dependency.
- **OA-13 (R13):** Generate offline and deterministically from exact source text.
  Schema metadata never runs code, loads templates or causes network access.
- **OA-14 (R14):** Target Python 3.11+ with frozen dataclasses or typed
  dictionaries, action-specific create/patch inputs, typed filters/orderings,
  action methods, exceptions and a transport Protocol. Generated code must pass
  pyright, mypy and ty without suppression comments.
- **OA-15 (R15):** Generate TypeScript from the same description, preserving the
  same types and operations.
- **OA-16 (R16):** Keep generated code to types, inert metadata, value conversion
  and transport calls. Preserve absence separately from null and escape all
  generated names/strings. Business rules execute in the host.
- **OA-17 (R17):** Use predictable documented names, allow explicit overrides
  and refuse collisions rather than merging distinct schema identities.
- **OA-18 (R18):** Support checked-in output: detect byte drift, refuse to
  overwrite hand edits, regenerate atomically and explain compatible/breaking
  API changes.
- **OA-19 (R19):** Stamp generated code with the description version and source
  digest so the host can reject a client/schema mismatch before effects.

### Connect to the host

- **OA-08 (R8):** Return typed errors for invalid fields, denial, conflict,
  failed preconditions, excessive rows and busy targets. Messages contain no
  instance data. Also distinguish transport failure, unmet consistency and a
  write whose commitment is unknown; never retry an uncertain write automatically.
- **OA-10 (R10):** Define a small abstract transport for reads, read-many,
  actions, batches and optional advisory validation. Consumers implement it.
- **OA-11 (R11):** Specify shared request/response documents and examples. A
  Hohfeld binding translates once at the host boundary; plugins use generated
  methods and never construct Hohfeld plans or executable effects.
- **OA-12 (R12):** Keep plugin calls unchanged across local/remote hosting and
  table/ontology storage and synchronous/asynchronous backends through one calling
  convention. Use explicit per-client bindings without global model configuration.
  Typed actions have the same calling surface regardless of storage.
- **OA-20 (R20):** Supply an in-memory test fake and reusable assertions for
  bindings, covering paging, cursors, bounds, errors, batches, replay and tokens.

### Non-Functional Requirements

Generation must produce identical bytes in Bun and real Chromium without network
requests or browser host-runtime dependencies. Values must never be silently
rounded, truncated or coerced. Output must import in isolated Python 3.11 without
third-party packages. Processing has finite limits and leaves original sources
and prior output intact on failure.

## User Stories

- [US-091 — Derive and review an ontology API](../user-stories/US-091-ontology-access-description.md).
- [US-092 — Generate and use the client](../user-stories/US-092-portable-ontology-client.md).

## Edge Cases and Error Handling

Missing semantics that affect a selected operation produce a precise diagnostic,
not a guess. An action-generated field stays specific to that action. A foreign
cursor/token is rejected. Lost write responses preserve uncertainty. Validation
is advisory; the host rechecks authorization and preconditions when applying.

## Success Metrics

A developer generates from a current UMF schema without extra modeling, catches
wrong keys/arguments with type checking, and uses unchanged plugin code in host
and worker. Exact-value/presence tests, deterministic generation, drift checks
and the shared binding tests verify the behavior above.

## Constraints and Assumptions

The latest UMF is the development target as UMF evolves; the API description's
format version and schema digest are automatic tool metadata. Existing table
compilers/executors become binding internals behind the shared API. Unsupported
backend capabilities fail explicitly rather than changing operation meanings.
UMF owns generation and the transport contract; consumers own runtime behavior.

## Dependencies

FR-56 and the current UMF field/key/relationship/action declarations.
[SD-033](../../02-design/solution-designs/SD-033-generated-ontology-access.md)
records the implementation approach. The original
[Praxis request](../../00-discover/inputs/praxis-ontology-access-request-2026-10-18.txt)
is retained; the owner's latest-UMF direction supersedes its old-version scope.

## Out of Scope

Production transport, execution, authorization/grants, storage, audit, plugin
loading, ORM sessions/change tracking and generic save paths. The fake is for tests.
