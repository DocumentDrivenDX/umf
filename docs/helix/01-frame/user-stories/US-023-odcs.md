---
ddx:
  id: US-023
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-023: Preserve ODCS contracts

**Feature:** FEAT-002 NAT-01–04. **PRD:** FR-1/5/6/12/37/39/41. **Priority:** P0.

## Story and Context

As a metadata-tool developer, I want to inspect and edit ODCS contracts in a browser while
retaining business, physical, quality, service-level and unknown content. A data contract's
shape does not establish that its operational promises are being enforced.

## Walkthrough

Import an official contract, inspect its versioned shape diagnostics, edit an existing metadata
value, serialize UMF as JSON/YAML and recover the original or candidate native contract.

## Acceptance Criteria

- **US-023-AC1:** Publish complete payload/package schemas and unchanged pinned native ODCS
  3.0.0–3.2.0 schemas. Preserve exact numeric values, original source and unknown content.
- **US-023-AC2:** Copied access/candidate edits retain all unrelated content. Unknown encoding
  additions block native export; unknown versions remain preserved without interpretation.
- **US-023-AC3:** Capture the full release YAML example subtree, qualify every import/native
  validation outcome and compare both formats plus candidate edits with independent validators
  and Chromium. Original-source bytes remain recoverable when unchanged.

- **US-023-AC4:** Resolve local v3.2.0 schema/property references by stable ID or explicit
  foreign-key name shorthand. Return source locations and copied targets with complete schemas.
  Ambiguity, missing targets, unsupported versions and external resources remain explicit;
  lookup must not infer array indexes, physical names or foreign-key enforcement.

- **US-023-AC5:** Inspect property/schema-level relationships and pair local composite
  endpoints in order. Report implicit/explicit source violations, arity/type mismatches,
  duplicate relationship IDs, unresolved references and bounded interpretation without
  claiming data-level foreign-key enforcement; publish a complete result schema.

- **US-023-AC6:** Propose an ID-selected element rename with explicit name-reference edits,
  preserved IDs and unchanged ordered local foreign-key endpoints. Block collisions or
  unresolved relationship context atomically. Preserve other content and report that SQL,
  quality rules and unknown consumers are not rewritten or proven equivalent.

## Boundaries and Dependencies

CONTRACT-001 and ADR-002 govern core and browser runtime. Reference resolution, quality/SLA
execution, physical-type interpretation, additional version snapshots and projections remain
required follow-up work. Similar names or shapes do not justify promotion into core.
