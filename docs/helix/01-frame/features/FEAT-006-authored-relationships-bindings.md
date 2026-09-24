---
ddx:
  id: FEAT-006
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: FEAT-005
      kind: informed_by
    - id: FEAT-004
      kind: informed_by
---

# FEAT-006: Authored relationships and physical bindings

**Priority:** P0. **Covered requirements:** FR-42–FR-44, with FR-3/8/40/41.
**Subsystem:** Physical bindings and authored generation; relationship core
admission is shared with FEAT-005. **Stories:** US-045–US-049.

## Overview

A model author can declare associations once, keep physical storage choices in
independent target bindings, and generate useful PostgreSQL DDL and GraphQL SDL.
The outputs expose every known semantic gap and retain the authored model.
Hohfeld supplies a concrete consumer need: it authors a matter graph in UMF
and currently must reconstruct relationship, storage and index meaning in each
generator. Its reported query-plan comparison motivates visible physical index
metadata; it is not a UMF benchmark or a claim about every PostgreSQL workload.

## Ideal Future State

One logical order/customer/product model has stable element identities and
authored relationships. A PostgreSQL binding can place fields in columns or
JSONB paths and declare indexes; a Delta binding can make different choices.
Changing either binding leaves the logical model unchanged. A consumer reads
physical filter/sort capability from the selected binding, not a logical field.
The PostgreSQL and GraphQL generators produce reviewable schemas and precise
residuals for meaning their targets cannot express.

## Problem Statement

Core references name targets and opaque roles but do not assert association
endpoints, multiplicity or direction. Native FK, GraphQL object fields and DDD
concept references can suggest overlapping ideas without proving author intent.
Storage placement and indexes are target-specific, and mixing them into logical
fields would make one model's meaning vary by deployment. Existing adapters
preserve native sources; the authoring path also needs directed generation.

## Requirements

- REL-01: Expose an authored relationship separately from generic references,
  instance edges and native observations. Preserve DDD concept-reference meaning
  as a qualified binding, not a replacement for either vocabulary.
- REL-02: Publish independently versioned target bindings for storage choices
  and index capabilities. Preserve unrecognized choices; report absent target
  support. A logical field cannot imply filterability or sortability.
- REL-03: Generate PostgreSQL DDL from DDD plus binding and GraphQL SDL from DDD
  plus relationships. Strict mode blocks non-exact requested obligations;
  report mode emits a complete candidate only with source-linked residuals.
- REL-04: Retain authored sources and native archives. Verify both recovery
  directions, existing adapter acceptance, independent native oracles, Bun and
  Chromium within stated versions/subsets. Separate two-priority relationship
  admission from all-five delivery and any FR-28 equivalence graduation.

## User Stories

US-045 covers relationship authoring and five-priority-system admission/delivery.
US-046 covers independent bindings and storage choices. US-047 covers physical
indexes. US-048 and US-049 cover the two directed generators. Each has its own
semantic contract and technical design, except US-046/047 share CONTRACT-042.

## Edge Cases and Error Handling

Reject malformed or unresolved endpoint IDs without changing an input model.
Keep undeclared native FKs and computed GraphQL object fields as observations,
never invented author intent. Report heterogeneous endpoint and source-side
cardinality losses. Unknown extensions and native bytes survive. A stale binding
or unsupported path blocks unsafe generation; unsupported but safe target
features can be emitted only with explicit report-mode residuals. Index
predicates remain opaque declared expressions, not UMF-executed rules.

## Success Metrics

The six relationship cases (one-to-one, many-to-one, many-to-many,
heterogeneous source, self-reference, undirected) each have strict/report and
both retained-recovery outcomes. Every declared binding/index choice in the
authored graph corpus has a target outcome. Generated DDL/SDL pass the existing
native adapters and pinned independent checks, with zero unreported known loss
in the corpus. Claims name versions, subsets, evidence and remaining gaps.

## Out of Scope

SPARQL and any query execution; GraphQL resolvers, arguments, pagination and
budgets; core promotion of embedded or edge storage; inference of relationship
intent from existing references, DDD cardinality or native foreign keys;
consumer-specific SQL views without a later projection contract.
