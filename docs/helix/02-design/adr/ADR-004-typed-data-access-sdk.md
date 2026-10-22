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
    - id: FEAT-031
      kind: informed_by
---

# ADR-004: One generated Python data access API

## Problem

Applications need typed reads, relationship traversal and actions over UMF
schemas regardless of whether data lives in tables, an ontology or a remote
service. Separate generated query functions for tables and direct clients for
ontologies expose execution details as two application APIs.

## Decision

Generate one schema-derived model/query/action API for all storage backends.
Developers compose expressions directly from `Model.objects` and generated
field/relationship references. Key selection, filtering, ordering and traversal
compose; terminals execute against an explicitly supplied client binding.
Generated typed action methods use that same binding.

No decorated query wrapper, separate parameter declaration or checked-in query
catalog is required to make an ordinary read executable. The generated client
builds typed request data and uses only the Python standard library. The host
binding validates the request and owns execution, SQL lowering through Weft where
applicable, bound parameters and storage-specific preparation/caching. Optional
prepared/reusable queries must preserve the same public query semantics.

Typed expressions do not authorize execution. Backend capability checks,
authorization, transactions, freshness and durable replay remain host obligations.
Unsupported operations fail explicitly without silently weakening their meaning.

## Why We Chose This

### Over mandatory generated query functions

The expression already names the schema, types and desired operation. Requiring
an application-authored wrapper plus parameter declarations duplicates that
information and makes table access unnecessarily different from ontology access.
Precompilation can optimize or restrict a deployment internally without defining
the universal public API.

### Over storage-specific model APIs

Table and ontology bindings can interpret the same typed requests. Applications
should change their injected binding rather than rewrite reads and actions.
Real differences in capabilities remain explicit errors or declared constraints.

### Over SQL strings or conventional ORM persistence

Generated fields, relationships and entity keys keep refactoring/type checking
schema-driven. Named actions preserve the host's mutation path without identity
maps, lazy I/O, change tracking or generic save methods. Client values never
become executable SQL text.

## Consequences

Developers learn one model/query/action surface. The shared generator and client
are storage-independent, while backend code stays behind consumer bindings.
A host compiling requests dynamically must validate every expression and bind
values; build-only validation is no longer the universal safety boundary.

Existing catalog/compiler/runtime work can support bindings or optional prepared
queries. It must be adapted to the common API; its presence does not establish
that the unified API is implemented. Tests must run unchanged application calls
against table and ontology bindings, including unsupported-capability refusals.

Drift signals: required `@query`/`Param` scaffolding, separate table/ontology
call sites, model-global connection state, client SQL assembly or silently
weakened backend guarantees.

## Concern Impact

Retain ADR-002 for the TypeScript generator and browser execution. Generated
Python is stdlib-only; backend drivers and compiler/runtime packages belong to
consumer bindings. Exact values, unknown-content preservation and consumer-owned
execution remain requirements. This replaces the earlier public requirement for
Pydantic models and mandatory catalog capture; historical implementation evidence
still describes the exact artifacts it tested.
