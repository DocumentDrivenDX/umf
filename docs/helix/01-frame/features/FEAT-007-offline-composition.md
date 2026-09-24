---
ddx:
  id: FEAT-007
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: FEAT-005
      kind: informed_by
    - id: FEAT-006
      kind: informed_by
---

# FEAT-007: Offline composition of pinned model revisions

**Priority:** Owner placement pending. **Covered requirements:** FR-15–19 and
FR-41; NFR-4–6, NFR-10–11, NFR-20–21 and NFR-50. **Stories:** US-050, US-051.

## Overview

A consumer can load several independently owned UMF documents as an explicit,
offline package and resolve cross-document references to exact revisions. A
sales model may refer to a shared reference-data model without flattening it.
The package records which bytes satisfy each revision pin; neither a network
lookup nor a matching display name supplies missing meaning.

## Problem Statement

CONTRACT-001 resolves `{role,module,element}` only inside one document, and its
`selectCoreElements` traversal only follows those local references. Documents
have opaque IDs but no schema revision identity. FR-15–17 require cross-schema
identity, composition and versioning, while architecture requires a projection
to disclose external or dangling dependencies. A graph engine that stores data
typed by separately revised sales and reference-data documents needs a stable
way to identify both type and revision. Its data execution remains outside UMF.

## Requirements

- COMP-01: Identify a document revision without redefining its stable document
  ID. A package pins exact revision IDs and verifies content integrity. Stable
  schema-element identity across revisions is distinct from revision-qualified
  resolution and does not imply semantic compatibility.
- COMP-02: Resolve an explicit external reference only through declared,
  packaged dependencies, by exact document ID, revision, module ID and element
  ID. Missing, ambiguous and mismatched revisions receive distinct diagnostics;
  no network or name search occurs.
- COMP-03: Define separately which core reference-bearing members may cross a
  document boundary. Preserve CONTRACT-001's bare references as local and keep
  key components within their record until a separate key design authorizes
  otherwise.
- COMP-04: Let metadata selection explicitly follow or stop at a document
  boundary. Return boundary references, visited revision identities and cycle
  diagnostics without pruning retained source documents or extension payloads.
- COMP-05: Version and test migration/rollback. Unknown content and native
  archives remain recoverable, while unsafe edits or projections block when a
  required dependency cannot be interpreted.

## Success Criteria

US-050 exercises two revisions of a shared model, a sales-to-shared reference,
same-named elements in different documents, a missing dependency, two entries
for one revision pin, a digest mismatch, a cross-document cycle and both
selection boundary policies. Bun and a real browser agree for the supported
version and package subset. Old local references retain their old meaning.

## Boundaries and Dependencies

CONTRACT-045 proposes the successor surface to CONTRACT-001; it does not change
the bootstrap contract or current core schema. The Key design must settle stable
named key identity before a relationship may name a target key across documents.
Schema comparison under FR-18/19 depends on the revision identity defined here;
CONTRACT-046 defines a separate read-only comparison of two pinned user-schema
revisions. It reports ideal assertion changes and obligations, not native
compatibility or row-validation outcomes. Package discovery,
network fetching, data validation, edge execution and automatic cross-revision
rebinding are outside UMF's described operation.

## Open Decisions and Placement

The owner decides where implementation sits in the ordered core backlog and
whether its first delivery includes every proposed crossing member or starts
with general references and `itemType`. Decide the first supported revision-token
syntax, package format and digest scope before a schema or API is published.
CONTRACT-045 records a concrete proposal and diagnostics so these choices can be
reviewed without implying implementation authorization.
