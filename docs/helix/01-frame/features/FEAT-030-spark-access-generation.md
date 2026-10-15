---
ddx:
  id: FEAT-030
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: derived_from
---

# Feature Specification: FEAT-030 — Spark and Unity Catalog access generation

**Priority:** P0 within this proposal. **Owner:** UMF maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation.
**Covered PRD Requirements:** FR-54; supporting FR-43 and NFR-50.

## Overview

Generate explicit Spark schemas, Delta table proposals and typed boundary models
for Unity Catalog consumers. Spark is the compute engine; Delta is the table
format; Unity Catalog is the catalog/governance target. Each needs its own pin.

## Ideal Future State

A maintainer reuses UMF meaning for distributed tables and validates bounded
materialized results. Ashlar consumes generated declarations inside its original
publication protocol, retaining every selected native snapshot identity.

## Problem Statement

DataFrame annotations alone do not prove column shapes, and catalog keys do not
establish uniqueness or references. Regenerating table code must not flatten
Ashlar's immutable publications into latest-table reads or independent writes.

## Requirements

- **SP-01:** Generate Spark field/nested schemas and native Delta declarations from explicit versioned bindings, preserving metadata and qualified value meaning.
- **SP-02:** Expose typed complete rows and named projections at explicit runtime validation boundaries; arbitrary expressions must not inherit unchecked result types.
- **SP-03:** Distinguish metadata declarations, observed dataset validation and enforced native constraints.
- **SP-04:** Generated code must leave session configuration, lazy execution, materialization bounds, batch writes and retries under host ownership.
- **SP-05:** Ashlar adoption must preserve full publication vectors, native table UUID/version, source progress, custody, fencing and ACK obligations.

### Non-Functional Requirements

No generation/import may start Spark or collect data. No supported exact-value
case may round silently. Local Spark/Delta evidence must never be promoted to
managed Unity Catalog acceptance. Every materialization helper must have an
explicit row bound and complete/truncated outcome.

## User Stories

- [US-083](../user-stories/US-083-generated-spark-access.md).
- [US-085](../user-stories/US-085-ashlar-generated-substrate.md).

## Edge Cases and Error Handling

Unsupported decimal precision, timestamp interpretation, nullable map keys,
collations or opaque relevant metadata must refuse. Missing publication snapshots
must refuse without latest fallback. Empty results still require native schema
verification; a sample cannot establish dataset-wide validity.

## Success Metrics

All admitted schema/value corpus cases match independent native observations;
all selected catalog claims have managed evidence or explicit unqualified status;
Ashlar conformance witnesses preserve publication and ACK outcomes.

## Constraints and Assumptions

Spark 4.0.1 is an existing repository oracle candidate. Delta, PySpark, Databricks
Runtime, Unity Catalog service observations and configuration need explicit locks
before their profiles can be qualified. No warehouse environment is authorized
by this design request.

## Dependencies

FEAT-028, CONTRACT-017/064 and proposed CONTRACT-067/068/069. Ashlar's own
publication/read/table/resolver contracts govern downstream adoption.

## Out of Scope

A general typed PySpark expression compiler, global uniqueness enforcement via
preflight queries, cross-table transactions inferred from Delta commits, policy
installation and replacement of Ashlar publication or Weft query compilation.
