---
ddx:
  id: US-021
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-021: Preserve Iceberg table metadata context

**Feature:** FEAT-002 (NAT-01–04). **PRD:** FR-1/5/6/12/37/39/41. **Priority:** P0.

## Story and Context

As a metadata-tool developer, I want Iceberg table schemas and their surrounding metadata
in one editable browser model so that metadata tools retain identity, history and unknown
content instead of flattening a table to its current schema. CONTRACT-021 owns the interface.

## Walkthrough

Import a pinned table metadata fixture, inspect its location and exact counters, propose a
location edit, round-trip through UMF JSON/YAML and compare native parsing/re-emission. The
candidate is reviewable metadata; it does not move data or commit a table change.

## Acceptance Criteria

- **US-021-AC1:** Known v1–v3 field shapes and embedded schemas are described by JSON Schema
  and preserved through both formats. Upstream fixture outcomes and native parser/writer
  disagreements are explicit; no default insertion is required for source preservation.
- **US-021-AC2:** Signed-int64 counters and IDs retain exact tokens. Unknown native fields
  and versions survive with interpretation warnings. Unknown representation content remains
  in UMF and blocks lossy export.
- **US-021-AC3:** Pointer access copies values; candidate edits are atomic. Invalid known
  shapes/ranges reject without modifying source. Native metadata candidates and browser
  behavior agree within each runtime's declared scope.

- **US-021-AC4:** A separate context report resolves current schema/spec/order and snapshot
  references, rejects ambiguous retained IDs, and checks main-branch coherence using exact
  integers. Invalid references remain preservable source. Legacy defaults and expired parents
  are not silently materialized or rejected; every report declares incomplete interpretation.

- **US-021-AC5:** Single-source transform type inspection reports compatibility, unknown
  interpretation and specification result types without executing values. A native matrix
  qualifies differences, and browser results agree. Field binding, version availability and
  historical spec evolution remain separate checks.

- **US-021-AC6:** Bind selected partition/sort fields to current schema IDs, preserving nested
  struct paths and reporting collection, missing-field, transform, direction/null-order and
  duplicate-field problems. Preserve v3 multi-source fields but block unimplemented binding.
  Historical specs are not rebound to the current schema. Retain native parser disagreements.

- **US-021-AC7:** A v2/v3 field rename candidate appends a new schema with an explicitly
  supplied unused ID, changes the current schema selection, and retains historical schemas,
  field/identifier IDs and unrelated metadata. Reject invalid requests atomically; report
  resulting bindings and unresolved name-dependent metadata. Compare independent native
  schema evolution and both browser formats without asserting commit safety.

- **US-021-AC8:** Primitive widening candidates append a new schema while retaining original
  types in history. Check dependent partition fields across retained specs; reject narrowing,
  scale changes and unverified transforms atomically. Compare native schema evolution for
  int/long, float/double and decimal precision widening. Keep v3 date/unknown promotions and
  physical bounds decoding explicitly unfinished.

- **US-021-AC9:** Read authored Parquet files with the original and UMF-promoted schemas
  using an independent native reader. Check exact numeric values, promoted runtime types,
  untouched columns and field-ID resolution despite different physical names. Bind results
  to file/metadata hashes; distinguish file projection from manifest pruning or safe commits.

## Edge Cases, Tests and Dependencies

Tests cover missing required fields, malformed embedded schemas, max int64, future versions,
unknown statistics types and PyIceberg's v3 export limitation. FEAT-002, CONTRACT-001 and
CONTRACT-020 govern envelope/schema preservation; ADR-002 governs Bun/browser execution.

## Out of Scope

Bounded current-reference inspection does not establish full cross-reference consistency, partition/sort transform
semantics, snapshot history, default execution, encryption, file existence, atomic commits or
safe evolution. These remain required work, not implied by successful UMF validation.
