---
ddx:
  id: US-045
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-006
      kind: informed_by
    - id: FEAT-005
      kind: informed_by
    - id: umf.prd
      kind: informed_by
    - id: US-044
      kind: informed_by
---

# US-045: Author a relationship ideal

## Story

**As a** model author, **I want** to assert a named association between
independently keyed Record types, **So that** generators and metadata consumers
share its target key, participation bounds, lifecycle, optional association
attributes and navigation names without guessing from native syntax.

## Context

FR-15/42 and FEAT-005 IDEAL-01–05 govern this sixth ideal. CONTRACT-041 owns
exact shape, endpoint/key identity, mappings and residual rules; key's
five-system gate precedes implementation. Existing core references keep their
meaning. CONTRACT-040 Field cardinality describes container shape and cannot
express `1..*` record participation. A record-type Field remains containment by
value. Neither establishes a relationship.

## Walkthrough

1. Declare the relationship on a retained logical model and inspect it.
2. Choose a priority target and inspect strict and report outcomes.
3. Reimport the target with its retained report and recover the ideal or its residual.
4. Recover untouched native source, including unknown extensions and refinements.

## Acceptance Criteria

- **US-045-AC1:** Given a relationship with a stable ID, unique name and valid keyed Record endpoints,
  when the model is read, then source and target sets, each target's stable
  named-key identity, `min..max` participation at both ends, lifecycle,
  direction, optional inverse and association Record are available without
  decoding native payloads.
- **US-045-AC2:** Given duplicate IDs or names, missing/non-Record endpoints, unresolved
  target keys, an unkeyed association Record or malformed multiplicity, when
  validated, then the operation fails atomically with source paths.
- **US-045-AC3:** Given a DDD many-valued concept field, record-valued Field,
  native FK or GraphQL object field without authored declaration, when
  classified, then no relationship author intent is invented and native
  refinements remain. A FK, including `ON DELETE CASCADE`, does not establish
  aggregate membership or target lifecycle ownership.
- **US-045-AC4:** Given a non-exact target mapping, when strict mode runs, then
  no partial candidate is emitted and the source remains recoverable.
- **US-045-AC5:** Given the same mapping in report mode, when a candidate is
  safe, then every lost endpoint, target key, direction, participation bound,
  lifecycle or association-Record obligation has a source-qualified residual.
- **US-045-AC6:** Given ideal→native→ideal with its report, when reimported,
  then the authored relationship or an explicit non-recovery residual returns.
- **US-045-AC7:** Given native→ideal→native, when exported from retained source,
  then bytes outside the ideal's claim, including unknown content, match.
- **US-045-AC8:** Given one-to-one, many-to-one, many-to-many, heterogeneous,
  self, undirected, alternate-key target, `1..*` and reified `Enrollment`
  examples, when projected, then each has a qualified exact/approximate/residual
  or refusal outcome. `Enrollment` retains its own key and `grade` field.
- **US-045-AC9:** Given at least two useful evidenced priority mappings, when
  admission is recorded, then it is distinct from all-five delivery and from
  native-equivalence graduation; all five plus GraphQL/RDF/LinkML retain their
  own version/subset evidence.
- **US-045-AC10:** Given a legacy document or colliding unknown member, when
  migrated and rolled back, then neither old nor new meaning is lost or silently
  reinterpreted.

## Edge Cases

Endpoint IDs resolve exactly under CONTRACT-001; the target key resolves by
CONTRACT-040 stable named-key identity. Cross-document references remain an
explicit open dependency. A heterogeneous source set cannot be reduced to one
FK type; GraphQL cannot express source-side participation. PostgreSQL `NOT
VALID` and SQL Server `NOCHECK` do not certify existing rows. PostgreSQL
default `MATCH SIMPLE` skips a composite FK check when any referencing part is
NULL. A FK may target a UNIQUE alternate key. Avro and Parquet have no
referential enforcement. An inverse name is presentation intent, not proof of
a second native association.

## Test Scenarios

Exercise the six original authored cases, alternate-key/reified/bounded cases,
and undeclared native counterexamples under Bun, native oracles and Chromium.
Each criterion receives an exercising test
with an `@covers US-045-ACn` citation and source/version fingerprints.

## Dependencies

FR-3/15/42; FEAT-005/006; CONTRACT-001/040/041; TD-044/045; key five-system
gate. Cross-document resolution is a separate later design dependency.

## Out of Scope

Instance edges, automatic FK inference, reference-resolution changes, native
replacement and query execution.
