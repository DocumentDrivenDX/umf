---
ddx:
  id: US-050
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-007
      kind: informed_by
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: US-044
      kind: informed_by
    - id: US-045
      kind: informed_by
---

# US-050: Resolve pinned references across offline documents

## Story

**As a** schema consumer holding sales and shared reference-data models,
**I want** to resolve references through exact packaged revisions,
**So that** stored data remains attached to the intended schema element and
selection cannot silently switch to a newer or similarly named type.

## Context

FR-15–17 require stable identity, composition and version awareness. NFR-11
requires deterministic offline packages. CONTRACT-001's bare references remain
local; CONTRACT-045 proposes the separate external form and resolver. The
property-oriented graph engine consumes this schema but performs data queries,
mutations and constraint execution itself under NFR-50.

## Walkthrough

1. Publish two document revisions with stable document and element IDs and
   distinct revision IDs; package the exact required revision with an integrity
   digest.
2. Declare an external target from the sales model using document ID,
   revision, module ID and element ID, and resolve only through the package.
3. Select sales elements with boundary policy `stop`, then `follow`, and inspect
   retained boundary reports and revision-qualified selected identities.
4. Edit the shared model into a new revision; show that the old reference still
   points to its pinned revision until an explicit rebind occurs.

## Acceptance Criteria

- **US-050-AC1:** Given a legacy `{role,module,element}` reference, when the
  successor version is read, then it resolves only inside its containing
  document; migration never invents an external target.
- **US-050-AC2:** Given an external reference to an exact packaged revision,
  when resolved offline, then document/revision/module/element identities match
  exactly, including when names or namespaces collide.
- **US-050-AC3:** Given an undeclared package dependency, missing document,
  wrong revision, duplicate pin, conflicting bytes or digest mismatch, when
  resolution is requested, then a distinct path-bearing diagnostic identifies
  the fault; no network lookup or substitute revision occurs.
- **US-050-AC4:** Given `references:transitive` with `documentBoundary:stop`,
  when selected, then external references appear as boundary entries, local
  traversal remains unchanged and no external element is silently included.
- **US-050-AC5:** Given `references:transitive` with
  `documentBoundary:follow` and a valid closed package, when selected, then
  external targets are included with revision-qualified provenance; cycles
  terminate and report their closing edge.
- **US-050-AC6:** Given a cross-document `itemType`, record-type reference or
  future relationship endpoint/target-key reference, when validated, then only
  the contract-authorized form resolves; a key component outside its owning
  record is rejected, not silently made a key.
- **US-050-AC7:** Given the same stable element ID in two revisions, when
  inspected, then its lineage identity agrees and its resolution identities
  differ; changing the ID creates a new element with no inferred rename.
- **US-050-AC8:** Given an unresolved dependency or unfamiliar member required
  by an edit/projection, when strict mode runs, then it emits no candidate;
  report mode preserves source and emits a qualified residual only when a
  complete safe candidate exists.
- **US-050-AC9:** Given an old document and successor document, when migrated
  and rolled back, then original local references, unknown content, native
  archives and explicit new external declarations remain recoverable without
  reinterpretation.
- **US-050-AC10:** Given the supported package corpus, when run in Bun and
  Chromium, then resolution, selection and diagnostics agree within named
  versions and subsets. No native round-trip or evolution-compatibility claim
  follows solely from package resolution.

## Dependencies and Open Decisions

FEAT-007 and CONTRACT-001/040/041/045 govern this story. Owner backlog
placement remains open. Resolve the exact package serialization, revision-token
syntax and digest scope before implementation; reserve no core member until
versioned migration and collision tests are written. Schema-evolution comparison
depends on this story's revision identity but is not part of this acceptance.
