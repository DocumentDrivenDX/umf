---
ddx:
  id: US-030
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-030: TableSpec schema ingestion

As a schema consumer I need TableSpec tables and columns ingested into UMF with
usable core scalar metadata and complete native meaning retained.

- AC1: Versioned extension and complete payload/native schemas; exact JSON/YAML
  native recovery, including unknown fields and exact numeric metadata.
- AC2: Core scalar classifications and copied native table/column access, retaining all
  qualifiers and contextual nullability; embeddings never become scalar strings.
- AC3: Independent pinned native validation/normalization comparisons and Chromium
  parity across representative schemas, with known model/schema differences explicit.
- AC4: Explicit split-table/column bundle loading and copied edit synchronization;
  reject ambiguity or unsupported edits without discarding original meaning.
  Support copied table metadata changes and explicit repair of table-level references
  after column renames. Preserve shadowed inline columns, unrelated files and attached
  core metadata. Independently verify accepted repaired schemas and preserved native
  rejection of unknown content; do not imply browser-side Pydantic validation.
- AC5: Robust projections involving prioritized PostgreSQL, SQL Server, Avro and
  Parquet integrations, with refinement mismatches and losses reported.

The initial monolithic and split importers cover portions of AC1–AC4, including
copied column edits and exact split recovery. Native loader migrations are not
executed in JavaScript; split-to-monolithic lowering, file insertion/deletion,
AC5 and broader native coverage remain required.

CONTRACT-033/038 provide both TableSpec/Avro schema projection directions and a
five-field carrier cycle with independent native binary/value agreement. This
advances AC5 without completing PostgreSQL/SQL Server/Parquet mappings, complex
value encoding or general native semantic equivalence.

CONTRACT-039 adds composed PostgreSQL/SQL Server/Parquet→Avro→TableSpec schema
paths with original context, both stage results and qualified losses retained.
Four representative outputs have native target-model/browser evidence. AC5 still
requires broader mappings and native value transforms; composition is not proof
of end-to-end equivalence.
