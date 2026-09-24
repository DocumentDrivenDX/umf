---
ddx:
  id: US-025
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-025: Preserve and edit RDF schema datasets

**Feature:** FEAT-002 NAT-01–04. **PRD:** FR-1/5/6/12/37/39/41. **Priority:** P0.

## Story and Context

As a schema integration maintainer, I want RDF terms and graph context to survive metadata edits,
so I can carry ontology and shape declarations without flattening blank-node identity, literal
lexical forms or named graphs. RDF syntax alone does not establish OWL reasoning or SHACL validity.

## Walkthrough

Import an N-Quads source, inspect copied terms, replace one quad, serialize the UMF document in both
formats and export the candidate. Inspect diagnostics and compare dataset meaning independently.
CONTRACT-025 defines the public surface and preservation boundaries.

## Acceptance Criteria

- **US-025-AC1:** Complete package/payload schemas preserve RDF 1.1 N-Quads terms, ordered
  occurrences, local blank-node scope and exact original bytes through both UMF formats.
- **US-025-AC2:** Copied term inspection and atomic existing-quad edits retain lexical numbers,
  datatypes, named graphs and unknown representation content. Unsupported syntax and lossy native
  export fail explicitly; node names do not become core identities by structural similarity.
- **US-025-AC3:** Every case in the pinned official N-Quads syntax manifest has its expected
  outcome. Independent RDF parsing verifies positive datasets and edited candidates, including
  blanks shared across graph/subject/object positions, duplicate occurrences and custom datatypes.
  Browser evidence and independent-parser disagreements are recorded separately.

- **US-025-AC4:** Propose dataset-wide IRI renames with explicit changed positions, preserving
  original source, duplicate occurrences, blank scope and literal text. Block existing-target
  collisions, unsupported encodings and invalid resulting terms atomically. Compare native
  dataset changes and browser round trips, including datatype and graph-name occurrences.

- **US-025-AC5:** Preserve RDF 1.1 Turtle with explicit base context, stable scoped blank nodes
  and exact original text. Cover the entire pinned syntax/evaluation corpus, official expected
  graphs, N-Quads projections and candidate edits in Bun and Chromium. Reject named-graph loss
  and newer-version syntax, and report independent parser normalization/resolution differences.

- **US-025-AC6:** Preserve RDF 1.1 TriG, including empty named graphs and blank names shared
  with ordinary terms. Cover all pinned syntax/evaluation cases, both UMF formats, native/browser
  edits and empty-graph renames. Block graph loss in N-Quads/Turtle and record parser disagreements.

- **US-025-AC7:** Compose supplied RDF datasets under explicit graph-union and disjoint-input
  blank-node policies. Preserve empty graphs, duplicate occurrences, lexical terms and complete
  source documents; expose blank-node maps and quad provenance. Unknown RDF encodings block
  atomically. Compare all positive baseline datasets merged with a shared-blank fixture in native
  and browser runtimes, including identical source ids/scopes and two UMF formats.

## Edge Cases and Dependencies

An authored OWL/SHACL metadata dataset exercises duplicate labels, named blank graphs and exact
large-number lexical values. An unknown encoding field survives UMF serialization but blocks native
export. RDF 1.2 directional literals/triple terms are rejected by the RDF 1.1 profile. CONTRACT-001
and ADR-002 govern envelope/browser behavior. Other RDF syntaxes, dataset
canonicalization/shared-blank merging, semantic edits, OWL/SHACL execution and projections remain required work.
