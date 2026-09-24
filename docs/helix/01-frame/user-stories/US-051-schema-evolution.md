---
ddx:
  id: US-051
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
    - id: US-050
      kind: informed_by
    - id: US-044
      kind: informed_by
    - id: US-045
      kind: informed_by
---

# US-051: Compare two pinned revisions of a user schema

## Story

**As a** consumer storing records typed by revision R1, **I want** a
source-anchored comparison with revision R2, **So that** I can identify changed
assertions and the data checks or migration decisions needed before using R2.

## Context

FR-17–19 distinguish schema/model revisions and semantic comparison from core
envelope migration and native compatibility. CONTRACT-045 proposes exact offline
revision pins and stable element lineage. UMF describes a change and its known
effect on the ideal value domain; the sister graph engine and native systems
decide whether existing rows satisfy R2 (NFR-50). No comparison result alone
proves a PostgreSQL, Avro or Iceberg migration safe.

## Walkthrough

1. Package R1 and R2 with their declared dependencies and verify each revision
   pin before comparing a shared document ID.
2. Match modules and elements by stable IDs, then named keys by key ID; compare
   covered core assertions and retained extension payloads at source paths.
3. Inspect an ordered report of added, removed and changed assertions, each with
   a justified `widens`, `narrows`, `reinterprets` or `unknown` effect and any
   data-check obligation.
4. Hand the report and both unchanged sources to the engine, which performs any
   row checks or migration outside UMF.

## Acceptance Criteria

- **US-051-AC1:** Given R1/R2 for the same document ID with distinct verified
  revision pins, when compared offline, then every entry names both revision
  identities, stable module/element/key identity when present, and old/new source
  paths and values. Results are deterministic regardless of package order.
- **US-051-AC2:** Given additions, removals and changes to `kind`,
  `scalarType`, `nullability`, `cardinality`, supported facets, named keys and
  `references`, when compared, then each covered assertion receives a change
  kind and an effect backed by the contract's rule; changes to the target of a
  reference or a key tuple are never labeled equivalent by matching names.
- **US-051-AC3:** Given `required` → `absent-allowed` and `length.max` 20 →
  50, when all other relevant assertions agree, then the applicable field
  acceptance domains widen. Reverse changes narrow and report a check of R1
  data before R2 is used. A scalar-family change is `reinterprets`.
- **US-051-AC4:** Given an absent or unavailable extension validator and a
  changed extension payload, when compared, then the effect is `unknown`, its
  old/new payloads and paths remain available, and no compatibility label is
  inferred. An unmodified opaque payload remains unmodified, not reclassified.
- **US-051-AC5:** Given formatting-only, representation-only, identical parsed
  content and materially changed content, when compared, then the report
  distinguishes textual difference, representation difference, asserted
  equivalence within the understood subset, and material/unknown change without
  treating a preserved native archive as interpreted semantics.
- **US-051-AC6:** Given a missing, ambiguous, mismatched or digest-invalid
  dependency; a reused revision ID for conflicting content; or a lineage ID
  changed with no explicit mapping, when compared, then a path-bearing
  diagnostic blocks a complete semantic conclusion. The comparator never fetches
  a document, selects a newer revision, or invents a rename.
- **US-051-AC7:** Given cross-document references and cycles, when compared,
  then each revision's declared dependency closure is resolved independently;
  cycles terminate by revision-qualified visited identity. Rebinding a target
  revision is reported even if the target's element ID and name stay equal.
- **US-051-AC8:** Given a narrowing, reinterpreting or unknown change, when
  strict use requires proven data acceptance, then no safe-to-migrate claim is
  produced. Report use retains both complete sources and states precise checks,
  residuals or unresolved obligations without executing them.
- **US-051-AC9:** Given a prior envelope and a successor revision-aware
  envelope, when migrated and rolled back, then unknown members, extension
  payloads, native archives and the original source bytes remain recoverable;
  comparison never mutates either input or rewrites a pin.
- **US-051-AC10:** Given the versioned fixture corpus, when run in Bun and a
  real browser, then reports agree. Native Avro/Iceberg/PostgreSQL compatibility
  outcomes remain separate native-oracle evidence, not claims derived from this
  ideal-level report.

## Edge Cases and Dependencies

Compare nullable/absent and empty values distinctly. An added required field,
new uniqueness assertion or tighter facet needs a row-level check; key removal
can affect references even if it relaxes a uniqueness assertion. Changes involving
unspecified semantics or unknown extensions remain unknown. No open-world or
closed-world record policy is inferred from an added or removed element.

CONTRACT-045 revision identity and US-050 must precede implementation. The
ordered core ideals and their current support gates remain independent; this
story may compare an assertion only when its exact version/profile is understood.
Owner backlog placement and the first comparison subset remain open. This story
and CONTRACT-046 are design proposals; no core schema or source change is
authorized by them.
