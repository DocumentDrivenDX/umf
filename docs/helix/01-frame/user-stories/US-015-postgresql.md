---
ddx:
  id: US-015
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-015: Preserve and edit native PostgreSQL schemas

**Feature:** FEAT-002, NAT-01–04. **PRD:** FR-1/5/6/12/37/39/41. **Priority:** P0.

As a schema author, I want PostgreSQL SQL and its native syntax tree available to browser
metadata tools so that edits can produce verifiable SQL without silently erasing meaning.

The user supplies SQL, retains its original text in UMF, reads a copied native node,
proposes an edit and regenerates SQL. Export must reject unknown content or native changes
rather than treating parse success as catalog validity. CONTRACT-015 defines the API.

- **US-015-AC1:** Preserve original SQL, comments, Unicode and exact numeric literals
  through UMF JSON/YAML. Native deparse/reparse agrees on the AST apart from source offsets.
  Samples cover keys, relationships, numeric defaults, generated columns, partitions,
  policies, views and functions. Browser checks make the same scoped claim.
- **US-015-AC2:** A candidate native-node edit changes regenerated SQL, leaves the original
  document untouched and retains the original source archive explicitly. A separate native
  parser confirms that the selected change propagates without other AST changes.
- **US-015-AC3:** Unknown native and representation content survives UMF but cannot be
  silently dropped by Protobuf conversion or SQL deparse. Invalid SQL/NUL input fails.
  Results remain incomplete for catalog resolution, permissions and server execution.

- **US-015-AC4:** Every case in the pinned upstream native deparser suite survives UMF
  JSON/YAML and native regeneration; a separate native wrapper verifies every emitted
  query. Browser execution covers the same corpus. Wrapper repairs preserve Boolean
  values without weakening unknown-content and native-fidelity guards.

- **US-015-AC5:** Execute authored DDL, UMF-regenerated DDL and a schema dump passed
  through UMF in separate disposable databases. Compare catalog metadata and positive/
  negative behavior: exact defaults, generated values, constraints, function results,
  row-level security and privileges. Pin the server image and list catalog fields tested.

- **US-015-AC6:** A versioned catalog capture keeps query provenance, observed metadata
  and original reconstruction SQL together through UMF JSON/YAML and native capture
  export. Browser callers can locate a relation by schema/name without losing native or
  unknown fields. Candidate edits mark reconstruction as stale; this state survives
  native export/reimport. Duplicate qualified observations fail ambiguous lookup.

- **US-015-AC7:** The next catalog profile includes user triggers, standalone composite
  types, range/multirange definitions and collations, while v1 captures remain readable.
  Reconstruction preserves those objects and tested behavior, exact sequence values and
  materialized-view definitions. A v2 capture missing a required object section is invalid.

- **US-015-AC8:** A versioned capture records native dependency endpoints and kinds
  without collapsing same-named objects from distinct catalogs/types. Browser queries
  return copied edges and distinguish unavailable coverage from zero matches. Live
  reconstruction preserves the captured dependency multiset and tested RESTRICT/CASCADE
  behavior; the result remains incomplete for full lineage and execution planning.

- **US-015-AC9:** Explicit per-column row encodings produce a JSON Schema and matching
  quoted SELECT query, with source retention and reported representation/constraint loss.
  Strict mode and unsupported bindings block output. Native rows from reconstructed
  databases validate independently, including exact large integer/decimal text; modified
  captures cannot generate queries. This is a read-row contract, not INSERT validation.

- **US-015-AC10:** Explicit PostgreSQL catalog field bindings produce Avro schemas
  with source retention, native type identities and reported constraint loss. Decimal
  and temporal subsets require explicit selection; unconstrained numerics, time-zone
  offsets, arrays and domains must not be silently flattened. Verify native typmod
  and exceptional-value behavior, independent Avro binary/value recovery, both UMF
  formats and real-browser execution. Schema projection does not imply a row encoder.

- **US-015-AC11:** Expose copied table/column declaration metadata directly from raw
  DDL, preserving native nodes and source paths. Separate CREATE/ALTER syntax from an
  executed final catalog; qualify scalar families by explicit/parser-normalized builtin
  names. Retain unresolved search-path/domain/array types, schema context and catalog
  expansion requirements. Verify native resolution counterexamples and browser WASM
  parsing, copied edits and both UMF recoveries.

This continues the PostgreSQL cycle; broader PostgreSQL regression corpora, general
catalog interchange and reconstruction, richer metadata consumers,
DDL migrations and cross-system/DDD projections remain required work.

- **US-015-AC12:** Execute regenerated candidate DDL in a fresh pinned PostgreSQL
  instance and compare its catalog with an independently authored expected schema.
  Exercise decimal precision/scale/defaults, nullable length-constrained text, check
  predicates, partial unique indexes and Unicode comments. Preserve exact identity
  values, original SQL archives and unrelated UMF context. Verify changed enforcement,
  candidate pg_dump reconstruction, both UMF formats and browser WASM regeneration.
  Keep this evidence separate from synchronization of edited catalog observations.
